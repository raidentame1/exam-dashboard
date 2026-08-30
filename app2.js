
function renderToday(){
  const today = new Date(); today.setHours(0,0,0,0);
  const clamped = today < START ? START : (today > END ? END : today);
  document.getElementById('todayLine').textContent = today.toLocaleDateString('en-AU',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const plan = dayPlan(clamped);
  document.getElementById('phaseLabel').textContent = plan.phase;

  const badgeWrap = document.getElementById('todayBadges');
  const seenSubj = new Set();
  badgeWrap.innerHTML = plan.blocks.filter(b=>{ if(seenSubj.has(b.subject)) return false; seenSubj.add(b.subject); return true; }).map(b=>
    `<span class="badge" style="background:${b.color}22; color:${b.color};"><span class="dot" style="background:${b.color};"></span>${b.subject}</span>`
  ).join(' ');

  const topicEl = document.getElementById('todayTopic');
  if(today < START){
    topicEl.textContent = `Your plan starts ${fmtDay(START)}.`;
  } else if(today > END){
    topicEl.textContent = `Prep window ended ${fmtDay(END)}.`;
  } else {
    const withTopic = plan.blocks.filter(b=>b.topic && !b.retrieval && (b.session==="Session 1"));
    if(withTopic.length){
      topicEl.innerHTML = withTopic.map(b=>
        `<div style="margin-bottom:4px;"><strong style="color:${b.color};">${b.subject}:</strong> ${b.topic}${b.unit? ` <span style="color:var(--dim2);">(${b.unit})</span>`:""}${b.ref? `<br><span style="color:var(--dim2); font-size:11.5px;">&#128214; ${b.ref}</span>`:""}${videoLinksHtml(b.subject, b.topic)}</div>`
      ).join('');
    } else {
      topicEl.textContent = "Tick items off as you complete them today.";
    }
  }

  const list = document.getElementById('todayChecklist');
  list.innerHTML = "";
  const dISO = iso(clamped);
  const store = loadStore();
  let idx = 0;
  let lastSession = null;
  plan.blocks.forEach(b=>{
    if(b.session && b.session!==lastSession){
      const head = document.createElement('div');
      head.className = "sess-head" + (b.retrieval ? " retrieval" : "");
      head.innerHTML = `<span>${b.session}</span><span class="line"></span>`;
      list.appendChild(head);
      lastSession = b.session;
    }
    b.items.forEach(label=>{
      const done = !!(store[dISO] && store[dISO][idx]);
      const row = document.createElement('div');
      row.className = "item" + (done?" done":"") + (b.retrieval?" retrieval":"");
      row.innerHTML = `<span class="box"></span><span class="lab">${label}</span><span class="grp">${b.subject}</span>`;
      row.dataset.idx = idx;
      row.addEventListener('click', ()=>{
        const willBeDone = !row.classList.contains('done');
        row.classList.toggle('done', willBeDone);
        row.querySelector('.box').classList.add('pop');
        toggleItem(dISO, row.dataset.idx*1);
        setTimeout(()=>{ renderKpis(); renderRings(); renderCalendar(); renderSyllabus(); updateCelebrate(plan, dISO); }, 180);
      });
      list.appendChild(row);
      idx++;
    });
  });
  updateCelebrate(plan, dISO);
}

function updateCelebrate(plan, dISO){
  const total = plan.blocks.reduce((n,b)=>n+b.items.length,0);
  const store = loadStore();
  const arr = store[dISO] || [];
  const done = arr.filter(Boolean).length;
  const card = document.getElementById('todayCard');
  const banner = document.getElementById('celebrate');
  const isComplete = total>0 && done===total;
  card.classList.toggle('complete', isComplete);
  banner.classList.toggle('show', isComplete);
}

// ---- KPIs ----
function renderKpis(){
  const today = new Date(); today.setHours(0,0,0,0);
  const daysLeft = Math.max(0, dayDiff(today, EXAM_START));
  animateValue(document.getElementById('kpiDays'), daysLeft);
  document.getElementById('countdownPill').textContent = daysLeft>0 ? `${daysLeft} days to go` : "Mocks are on";

  let totalAll=0, doneAll=0;
  for(let d=new Date(START); d<=END; d.setDate(d.getDate()+1)){
    const c = dayCompletion(new Date(d));
    totalAll += c.total; doneAll += c.done;
  }
  animateValue(document.getElementById('kpiOverall'), totalAll ? Math.round(100*doneAll/totalAll) : 0, "%");

  // streak: consecutive fully-complete days ending yesterday or today
  const streak = computeStreak().streak;
  const flame = streak>0 ? "&#128293;" : "";
  document.getElementById('kpiStreak').innerHTML = `${flame}${streak}<span> day${streak===1?"":"s"}</span>`;
  document.getElementById('streakKpi').classList.toggle('streak-hot', streak>0);

  const bestKey = 'studydash_beststreak_v2';
  let best = parseInt(localStorage.getItem(bestKey)||'0', 10);
  if(streak > best){ best = streak; localStorage.setItem(bestKey, String(best)); }
  const bestEl = document.getElementById('kpiStreakBest');
  if(streak>0 && streak>=best) bestEl.textContent = "Personal best!";
  else if(best>0) bestEl.textContent = `Best: ${best} day${best===1?"":"s"}`;
  else bestEl.textContent = "";

  updateStreakRisk(streak);
}

// ---- Rings (this week by subject) ----
function weekBoundsFor(date){
  const wn = weekNumFor(date) - 1;
  const [s,e] = WEEK_BOUNDS[wn];
  return [new Date(s), new Date(e) > END ? new Date(END) : new Date(e)];
}

function renderRings(){
  const today = new Date(); today.setHours(0,0,0,0);
  const clamped = today < START ? START : (today > END ? END : today);
  const [wStart, wEnd] = weekBoundsFor(clamped);
  const totals = {}; Object.keys(SUBJECTS).forEach(s=>totals[s]={total:0,done:0});
  const store = loadStore();

  for(let d=new Date(wStart); d<=wEnd; d.setDate(d.getDate()+1)){
    const plan = dayPlan(new Date(d));
    let offset = 0;
    plan.blocks.forEach(b=>{
      const n = b.items.length;
      if(totals[b.subject]){
        const arr = store[iso(d)] || [];
        const doneHere = arr.slice(offset, offset+n).filter(Boolean).length;
        totals[b.subject].total += n;
        totals[b.subject].done += doneHere;
      }
      offset += n;
    });
  }

  const grid = document.getElementById('ringsGrid');
  grid.innerHTML = "";
  Object.keys(SUBJECTS).forEach((s,i)=>{
    const t = totals[s];
    const pct = t.total ? Math.round(100*t.done/t.total) : 0;
    const color = SUBJECTS[s].color;
    const div = document.createElement('div');
    div.className = "ring-item";
    div.style.animationDelay = (i*0.06)+"s";
    div.innerHTML = `
      <div class="ring" style="background:conic-gradient(${color} ${pct*3.6}deg, var(--card2) 0deg);">
        <div class="hole">${pct}%</div>
      </div>
      <div class="ring-name">${s}</div>`;
    grid.appendChild(div);
  });
}

// ---- Syllabus progress (overall, whole prep window to date) ----
const openSubjects = new Set();
function computeSyllabusProgress(){
  const today = new Date(); today.setHours(0,0,0,0);
  const limit = today > END ? END : (today < START ? START : today);
  const store = loadStore();
  const bySubject = {}; Object.keys(SUBJECTS).forEach(s=>bySubject[s]={done:0,total:0});
  const byTopic = {};

  for(let d=new Date(START); d<=limit; d.setDate(d.getDate()+1)){
    const dd = new Date(d);
    const plan = dayPlan(dd);
    const arr = store[iso(dd)] || [];
    let offset = 0;
    plan.blocks.forEach(b=>{
      const n = b.items.length;
      const doneHere = arr.slice(offset, offset+n).filter(Boolean).length;
      offset += n;
      if(bySubject[b.subject]){ bySubject[b.subject].done += doneHere; bySubject[b.subject].total += n; }
      if(b.topic && !b.retrieval && TOPICS[b.subject]){
        const tKey = b.subject+"|"+b.unit+"|"+b.topic;
        if(!byTopic[tKey]) byTopic[tKey] = {subject:b.subject, unit:b.unit, topic:b.topic, done:0, total:0};
        byTopic[tKey].done += doneHere; byTopic[tKey].total += n;
      }
    });
  }
  return {bySubject, byTopic};
}
function unitsForSubject(s){
  const seen = [];
  TOPICS[s].forEach(([u])=>{ if(!seen.includes(u)) seen.push(u); });
  return seen;
}
function renderSyllabus(){
  const {bySubject, byTopic} = computeSyllabusProgress();
  const wrap = document.getElementById('syllabusGrid');
  wrap.innerHTML = "";
  Object.keys(SUBJECTS).forEach(s=>{
    const color = SUBJECTS[s].color;
    const sub = bySubject[s];
    const subPct = sub.total ? Math.round(100*sub.done/sub.total) : 0;
    if(sub.total>0) checkMilestone(s, subPct, color);

    const row = document.createElement('div');
    row.className = "subj-row" + (openSubjects.has(s) ? " open" : "");

    const head = document.createElement('div');
    head.className = "subj-row-head";
    head.innerHTML = `<span class="chev">&#9656;</span>
      <span class="name2" style="color:${color};">${s}</span>
      <span class="bar-track"><span class="bar-fill" style="background:${color};"></span></span>
      <span class="pct">${subPct}%</span>`;
    head.addEventListener('click', ()=>{
      if(openSubjects.has(s)) openSubjects.delete(s); else openSubjects.add(s);
      row.classList.toggle('open');
    });
    row.appendChild(head);

    const body = document.createElement('div');
    body.className = "subj-row-body";
    const units = unitsForSubject(s);
    units.forEach(u=>{
      const topics = TOPICS[s].filter(([uu])=>uu===u).map(([,t])=>t);
      let uDone=0, uTotal=0;
      topics.forEach(t=>{ const k=s+"|"+u+"|"+t; const rec=byTopic[k]; if(rec){ uDone+=rec.done; uTotal+=rec.total; } });
      const uPct = uTotal ? Math.round(100*uDone/uTotal) : 0;
      const ublock = document.createElement('div');
      ublock.className = "unit-block";
      ublock.innerHTML = `<div class="unit-head">${u}</div>
        <div class="unit-block-bar"><span class="bar-track"><span class="bar-fill" style="background:${color};opacity:.75;"></span></span><span class="pct">${uPct}%</span></div>`;
      const barFillUnit = ublock.querySelector('.unit-block-bar .bar-fill');
      requestAnimationFrame(()=>{ barFillUnit.style.width = uPct+"%"; });

      topics.forEach(t=>{
        const k = s+"|"+u+"|"+t;
        const rec = byTopic[k];
        const tPct = rec && rec.total ? Math.round(100*rec.done/rec.total) : 0;
        const trow = document.createElement('div');
        trow.className = "topic-row";
        trow.innerHTML = `<span class="tname">${t}</span><span class="bar-track"><span class="bar-fill" style="background:${color};"></span></span><span class="pct">${tPct}%</span>`;
        const bf = trow.querySelector('.bar-fill');
        requestAnimationFrame(()=>{ bf.style.width = tPct+"%"; });
        ublock.appendChild(trow);
      });
      body.appendChild(ublock);
    });
    row.appendChild(body);
    wrap.appendChild(row);

    const headFill = head.querySelector('.bar-fill');
    requestAnimationFrame(()=>{ headFill.style.width = subPct+"%"; });
  });
}

// ---- Calendar heatmap ----
// Row labels match the SAME week numbers shown in Today's Focus (weekNumFor), instead of a
// plain incrementing row counter - previously the calendar said "Wk 4" for the exact week that
// Today's Focus called "Week 5 - past papers", which was confusing. Exam-period rows get their
// own "Exam" label rather than reusing the last content week's number.
function calRowLabel(monday){
  if(monday >= EXAM_START) return "Exam";
  return "Wk " + weekNumFor(monday);
}
function renderCalendar(){
  const cal = document.getElementById('calGrid');
  cal.innerHTML = "";
  const head = document.createElement('div');
  head.className = "cal-row";
  head.innerHTML = `<div></div>` + ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x=>`<div class="cal-head">${x}</div>`).join('');
  cal.appendChild(head);

  let gridStart = new Date(START);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay()+6)%7));
  let gridEnd = new Date(END);
  gridEnd.setDate(gridEnd.getDate() + (7 - ((gridEnd.getDay()+6)%7) - 1));

  const today = new Date(); today.setHours(0,0,0,0);
  const streakDays = new Set(computeStreak().days);
  let cursor = new Date(gridStart);
  while(cursor <= gridEnd){
    const row = document.createElement('div');
    row.className = "cal-row";
    const label = document.createElement('div');
    label.className = "cal-wk-label";
    label.textContent = calRowLabel(new Date(cursor));
    row.appendChild(label);
    for(let i=0;i<7;i++){
      const d = new Date(cursor);
      const inRange = d>=START && d<=END;
      const cell = document.createElement('div');
      cell.className = "cal-cell" + (inRange?"":" faded");
      if(inRange){
        const plan = dayPlan(d);
        const c = dayCompletion(d);
        const isFuture = d > today;
        if(plan.blocks.length){
          const mainColor = plan.blocks[0].color;
          const pct = c.total ? c.done/c.total : 0;
          if(!isFuture && pct>0){
            cell.style.background = mainColor;
            cell.style.opacity = 0.35 + pct*0.65;
          } else {
            cell.style.border = `1px solid ${mainColor}`;
            cell.style.background = "var(--card2)";
          }
        }
        if(streakDays.has(iso(d))) cell.style.boxShadow = "0 0 0 2px #fb923c inset";
        if(iso(d)===iso(today)) cell.style.boxShadow = "0 0 0 2px var(--accent) inset";
        cell.title = fmtDay(d);
        cell.textContent = d.getDate();
      }
      row.appendChild(cell);
      cursor.setDate(cursor.getDate()+1);
    }
    cal.appendChild(row);
  }

  const legend = document.getElementById('calLegend');
  legend.innerHTML = Object.keys(SUBJECTS).map(s=>
    `<span><span class="dot" style="background:${SUBJECTS[s].color};"></span>${s}</span>`
  ).join('') + `<span><span class="dot" style="background:var(--accent);"></span>Today</span>`
    + `<span><span class="dot" style="background:transparent; border:2px solid #fb923c;"></span>Current streak</span>`;
}

// ---- Subject reference cards ----
function renderSubjectCards(){
  const wrap = document.getElementById('subjectCards');
  wrap.innerHTML = Object.keys(SUBJECTS).map(s=>{
    const info = SUBJECTS[s];
    return `<div class="subj-card" style="--c:${info.color};">
      <div class="name" style="color:${info.color};">${s}</div>
      <div class="meta">${info.weight} weight<br>${info.note}</div>
    </div>`;
  }).join('');
}

// ---- Final countdown panel: day-by-day plan through mock exams, plus a visible
// readout of the exam-frequency weighting (exam-insights.com QCAA data) that already
// drives topic order in dayPlan/getWeightedTopics above - previously only baked into
// the scheduling logic, never shown on the page itself.
function renderCountdownPlan(){
  const wrap = document.getElementById('countdownDays');
  const freqWrap = document.getElementById('freqGrid');
  if(!wrap || !freqWrap) return;
  const today = new Date(); today.setHours(0,0,0,0);

  if(today > EXAM_START){
    document.getElementById('countdownSub').textContent = "mocks are underway";
    wrap.innerHTML = `<div style="color:var(--dim); font-size:12.5px; padding:6px 2px;">Mocks began ${fmtDay(EXAM_START)} &mdash; see the calendar below for the rest of the exam period.</div>`;
    freqWrap.innerHTML = "";
    return;
  }

  // Floor the display at 31 Aug regardless of START/today, per request - this makes the
  // strip start exactly on the first day of the past-paper week (WEEK5_START) rather than
  // on the preceding weekly-review day, so it shows precisely the 7 days of prep (31 Aug -
  // 6 Sep) leading into "Mocks begin" on 7 Sep. Once 31 Aug passes it falls back to
  // tracking "today" as normal, so the strip doesn't accumulate stale past days forever.
  const COUNTDOWN_FLOOR = new Date(2026,7,31);
  const rangeStart = new Date(Math.max(today.getTime(), COUNTDOWN_FLOOR.getTime(), START.getTime()));
  document.getElementById('countdownSub').textContent = `${fmtDay(rangeStart)} → ${fmtDay(EXAM_START)}`;

  const chips = [];
  for(let c = new Date(rangeStart); c < EXAM_START; c.setDate(c.getDate()+1)) chips.push(new Date(c));
  chips.push(new Date(EXAM_START));

  wrap.innerHTML = "";
  chips.forEach(d=>{
    const isMock = localDateKey(d)===localDateKey(EXAM_START);
    const chip = document.createElement('div');
    chip.className = 'day-chip' + (iso(d)===iso(today)?' is-today':'') + (isMock?' is-mock':'');
    let phaseText, badgesHtml;
    if(isMock){
      const examSub = EXAM_DATE_SUBJECT[localDateKey(d)];
      phaseText = "Mocks begin";
      badgesHtml = examSub ? `<span class="dc-badge" style="background:${SUBJECTS[examSub].color}22; color:${SUBJECTS[examSub].color};">${examSub} exam</span>` : "";
    } else {
      const plan = dayPlan(d);
      phaseText = plan.phase;
      const seen = new Set();
      const subs = plan.blocks.filter(b=>{
        if(!SUBJECTS[b.subject] || seen.has(b.subject)) return false;
        seen.add(b.subject); return true;
      });
      if(subs.length){
        badgesHtml = subs.map(b=>`<span class="dc-badge" style="background:${b.color}22; color:${b.color};">${b.subject}</span>`).join('');
      } else {
        // Special-case days that aren't tied to one fixed subject (see dayPlan): a
        // generic "rest" badge would understate that these are still active study days.
        const label0 = plan.blocks[0] ? plan.blocks[0].subject : "";
        const special = label0==="Weakest subject this week" ? "Weakest subject"
          : label0==="Weekly Completion Checklist" ? "Weekly review"
          : "Rest / review";
        badgesHtml = `<span class="dc-badge" style="background:var(--border); color:var(--dim);">${special}</span>`;
      }
    }
    chip.innerHTML = `
      <div class="dc-date">${d.toLocaleDateString('en-AU',{weekday:'short'})} <strong>${d.getDate()} ${d.toLocaleDateString('en-AU',{month:'short'})}</strong></div>
      <div class="dc-phase">${phaseText}</div>
      <div class="dc-badges">${badgesHtml}</div>`;
    wrap.appendChild(chip);
  });

  // Exam-frequency insight columns - one per subject that has quantified topic-weight
  // data (see TOPIC_WEIGHTS above). Bars are scaled relative to the single highest
  // weight across all subjects, so the columns stay visually comparable.
  freqWrap.innerHTML = "";
  let maxW = 0;
  Object.values(TOPIC_WEIGHTS).forEach(w=>Object.values(w).forEach(v=>{ if(v>maxW) maxW=v; }));
  Object.keys(TOPIC_WEIGHTS).forEach(s=>{
    const top = Object.entries(TOPIC_WEIGHTS[s]).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const col = document.createElement('div');
    col.className = 'freq-col';
    col.innerHTML = `<h3 style="color:${SUBJECTS[s].color};">${s}</h3>` + top.map(([topic,pct])=>`
      <div class="freq-item">
        <div class="fi-top"><span class="fi-name">${topic.replace(/^Topic \d+: /,'')}</span><span class="fi-pct">${pct}%</span></div>
        <div class="freq-bar-track"><span class="freq-bar-fill" style="width:${maxW?Math.round(pct/maxW*100):0}%; background:${SUBJECTS[s].color};"></span></div>
      </div>`).join('');
    freqWrap.appendChild(col);
  });
  const note = document.createElement('div');
  note.className = 'freq-note';
  note.innerHTML = `Literature, Physical Education &amp; Music aren't broken into a ranked exam-frequency table &mdash; they're essay/practical-response papers with no published per-topic question-frequency breakdown on Exam Insights. They're still prioritised in the daily plan by their exam weight (25% each) and a full-syllabus rotation, so every topic gets covered before mocks start.`;
  freqWrap.appendChild(note);
  const src = document.createElement('div');
  src.className = 'freq-source';
  src.textContent = "Source: exam-insights.com QCAA Historical Trends — % of 2020–2025 past-exam questions per topic. Same data already sets the topic order in each subject's daily plan above.";
  freqWrap.appendChild(src);
}

renderToday();
renderKpis();
renderRings();
renderSyllabus();
renderCalendar();
renderSubjectCards();
renderCountdownPlan();
