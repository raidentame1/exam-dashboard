function lkey(unit, topic){ return unit + " :: " + topic; }
// Caps how many video links show inline in Today's Focus (the full list is on the Tracker page)
// so a topic with 20+ videos doesn't swamp the daily card.
const VIDEO_INLINE_CAP = 4;
function videoLinksHtml(subject, topic){
  const vids = (VIDEO_LINKS[subject] && VIDEO_LINKS[subject][topic]) || [];
  if(!vids.length) return "";
  const shown = vids.slice(0, VIDEO_INLINE_CAP);
  const extra = vids.length - shown.length;
  return `<div class="video-links"><span class="vlabel">&#9654; ${vids.length} video${vids.length===1?'':'s'} (Joel Speranza / Maths Videos Australia):</span> ` +
    shown.map(([title,id])=>`<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">${title}</a>`).join(', ') +
    (extra>0 ? ` <span style="color:var(--dim2);">&middot; +${extra} more on the Tracker page</span>` : "") +
    `</div>`;
}
// Picks 2 lessons (one per session) for a given topic-visit, advancing 2 lessons further
// into that topic's lesson list every time the topic comes up again on a later pass -
// so repeat visits work through fresh subtopics/worked examples rather than repeating.
function lessonsForVisit(subject, unit, topic, passNum){
  const lessons = (LESSON_REFS[subject] && LESSON_REFS[subject][lkey(unit, topic)]) || null;
  if(!lessons || !lessons.length) return [null, null];
  const L = lessons.length;
  const i1 = (passNum*2) % L;
  const i2 = (passNum*2+1) % L;
  return [lessons[i1], lessons[i2]];
}
// Formats a lesson object into the requested "Subtopic, Chapter, page, worked example/s"
// tail, so callers just prepend the topic name to get the full "Topic, Subtopic, Chapter
// number, page number, worked example/s" reference.
function refTail(lessonObj){
  if(!lessonObj) return "";
  const m = lessonObj.lesson.match(/^(Ch\s*\S+)\s*·\s*(.+)$/);
  const chapter = m ? m[1] : "";
  const subtopic = m ? m[2] : lessonObj.lesson;
  const we = lessonObj.we && lessonObj.we.length ? `, WE ${lessonObj.we.join(', ')}` : "";
  const note = lessonObj.note ? ` [${lessonObj.note}]` : "";
  return ` &mdash; ${subtopic}, ${chapter}, pp ${lessonObj.pages}${we}${note}`;
}

// Mirrors the exact topic-cycling logic used to build the Excel Daily Schedule:
// each subject's weekday slot (content weeks only, before Week 5) works through its
// exam-weight-ordered topic list (see getWeightedTopics above), wrapping around
// (pass 2 = practice, pass 3+ = past-paper style).
function topicsUpTo(targetDate){
  const counts = {}; Object.keys(TOPICS).forEach(s=>counts[s]=0);
  const result = {};
  let weekdayIdx = 0; // increments once per Mon-Sat content day processed (Sunday excluded)
  for(let d = new Date(START); d <= targetDate; d.setDate(d.getDate()+1)){
    if(d >= WEEK5_START) break; // no topic cycling in week 5 / exam period
    const wd = d.getDay();
    if(wd===0) continue; // Sunday is the only fully protected rest day now
    const sameDay = iso(d) === iso(targetDate);
    const slotSubjects = [...BIG3, weightedSmallSubject(weekdayIdx)];
    slotSubjects.forEach(s=>{
      const list = getWeightedTopics(s);
      const i = counts[s];
      const [unit, topic, ref] = list[i % list.length];
      const passNum = Math.floor(i / list.length);
      if(sameDay) result[s] = {unit, topic, passNum, ref};
      counts[s]++;
    });
    weekdayIdx++;
  }
  return result;
}
function passLabel(n){
  if(n===0) return "content review";
  if(n===1) return "practice questions";
  return "timed past-paper questions";
}

// Given only one final revision day per subject in the past-paper week (Week 5), this
// picks what that day should actually focus on so the limited time goes on the
// highest-value content rather than a vague "do a full past paper":
// - Subjects with published exam-frequency data (see TOPIC_WEIGHTS) get their top 3
//   highest-yield subtopics named explicitly, each as its own timed past-paper focus,
//   ordered by % of past-exam questions - directly reusing getWeightedTopics's ordering.
// - Subjects with no ranked frequency data (Literature, PE, Music) have few enough
//   topics that full coverage in one day is realistic, so every topic is listed,
//   grouped by unit, ensuring nothing gets skipped before mocks start.
function topicCoverageItems(s){
  const w = TOPIC_WEIGHTS[s];
  if(w){
    return getWeightedTopics(s).slice(0,3).map(([unit,topic])=>{
      const pct = w[topic];
      const short = topic.replace(/^Topic \d+: /,'');
      return `Timed past-paper questions &mdash; '${short}'${pct?` (${pct}% of past exam questions &mdash; highest-yield)`:''}`;
    });
  }
  const byUnit = {}; const order = [];
  TOPICS[s].forEach(([unit,topic])=>{
    if(!byUnit[unit]){ byUnit[unit]=[]; order.push(unit); }
    byUnit[unit].push(topic.replace(/^Topic \d+: /,''));
  });
  return order.map(unit=>`Practice covering ${unit.replace(/^Unit \d: /i,'')}: ${byUnit[unit].join('; ')}`);
}

function iso(d){ return d.toISOString().slice(0,10); }
// Local-calendar-date key (not UTC-shifted like iso()) - needed when matching against
// literal date strings from a real-world timetable (e.g. EXAM_DATE_SUBJECT), since iso()'s
// UTC conversion can roll the date back a day in positive-offset timezones like Australia.
function localDateKey(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function dayDiff(a,b){ return Math.round((b-a)/86400000); }
function fmtDay(d){ return d.toLocaleDateString('en-AU',{weekday:'short', day:'numeric', month:'short'}); }

const WEEK_BOUNDS = [
  [new Date(2026,7,19), new Date(2026,7,23)],
  [new Date(2026,7,24), new Date(2026,7,30)],
  [new Date(2026,7,31), new Date(2026,8,6)],
];
function weekNumFor(d){
  for(let i=0;i<WEEK_BOUNDS.length;i++){
    if(d >= WEEK_BOUNDS[i][0] && d <= WEEK_BOUNDS[i][1]) return i+1;
  }
  return d < WEEK_BOUNDS[0][0] ? 1 : WEEK_BOUNDS.length;
}

// ---- Spaced / interleaved retrieval helpers ----
// Retrieval 1: the topic this *same* subject covered last time it met (in-subject spacing).
function priorTopicForSubject(s, d){
  const t = topicsUpTo(d)[s];
  if(!t) return null;
  const list = getWeightedTopics(s);
  const idx = list.findIndex(([u,tp])=>tp===t.topic);
  if(idx<0) return null;
  if(t.passNum===0 && idx===0) return null; // this is the very first session for this subject - nothing to retrieve yet
  const prevIdx = (idx-1+list.length)%list.length;
  const prevUnit = list[prevIdx][0], prevTopic = list[prevIdx][1];
  const lessons = (LESSON_REFS[s] && LESSON_REFS[s][lkey(prevUnit, prevTopic)]) || null;
  const lessonRef = lessons && lessons.length ? lessons[0] : null;
  return {unit:prevUnit, topic:prevTopic, ref:list[prevIdx][2], lessonRef};
}
// Retrieval 2: whatever a *different* subject covered on the previous study day (interleaving).
function yesterdaySubjectTopic(d){
  let prev = new Date(d); prev.setDate(prev.getDate()-1);
  for(let i=0;i<6;i++){
    if(prev>=START && prev<WEEK5_START && prev.getDay()!==0){
      const prevTopics = topicsUpTo(prev);
      // prefer the "small" subject studied that day - guaranteed different from today's two
      // big-subject slots, so this is genuine cross-category interleaving.
      const found = SMALL3.map(s=> prevTopics[s] ? {subject:s, unit:prevTopics[s].unit, topic:prevTopics[s].topic} : null).find(Boolean);
      if(found) return found;
    }
    prev.setDate(prev.getDate()-1);
  }
  return null;
}

// Splits a topic's study into three focused sessions (mirrors the guide's
// Session 1 / Session 2 / Session 3 structure) rather than one flat list.
function sessionsForPass(pnum, topicLabel){
  if(pnum===0) return {
    s1:[`Braindump &mdash; write everything you remember about '${topicLabel}' before checking notes`, "Check against notes/slides &mdash; fill gaps in a different colour"],
    s2:[`Practice 2&ndash;3 questions on '${topicLabel}', unassisted`, "Mark & correct &mdash; note down error patterns"],
    s3:[`Flashcards for new formulas/definitions/quotes from '${topicLabel}'`, "Update Dot-Point Tracker confidence colour"]
  };
  if(pnum===1) return {
    s1:[`Review flashcards for '${topicLabel}' from last pass`],
    s2:[`Practice questions on '${topicLabel}' &mdash; deliberately vary the angle/application`],
    s3:["Mark & correct, then update Dot-Point Tracker"]
  };
  return {
    s1:[`Timed past-paper style questions on '${topicLabel}'`],
    s2:["Mark against the QCAA marking guide"],
    s3:["Log result & reflect in Exam Planner", "Update Dot-Point Tracker"]
  };
}
function sessionsForPassHalf(pnum, topicLabel){
  if(pnum===0) return { s1:[`Braindump on '${topicLabel}', then check against notes`], s2:[`2&ndash;3 practice questions on '${topicLabel}', mark & update tracker`] };
  if(pnum===1) return { s1:[`Review flashcards for '${topicLabel}'`], s2:[`Practice questions on '${topicLabel}', mark & update tracker`] };
  return { s1:[`Timed past-paper section on '${topicLabel}'`], s2:["Mark & log in Exam Planner"] };
}
// Same as sessionsForPassHalf but session 1 and session 2 each cite a specific lesson/chapter
// reference (subtopic, chapter, page, worked example numbers) instead of the bare topic name,
// so every task says exactly what to open and work through.
function sessionsForPassHalfRef(pnum, topic, lessonA, lessonB){
  const labelA = topic + refTail(lessonA), labelB = topic + refTail(lessonB);
  if(pnum===0) return { s1:[`Braindump on '${labelA}', then check against notes`], s2:[`2&ndash;3 practice questions on '${labelB}', mark & update tracker`] };
  if(pnum===1) return { s1:[`Review flashcards for '${labelA}'`], s2:[`Practice questions on '${labelB}', mark & update tracker`] };
  return { s1:[`Timed past-paper section on '${labelA}'`], s2:["Mark & log in Exam Planner"] };
}

// No confirmed per-subject exam dates exist yet for the mock exam window itself (7-17 Sep),
// so - rather than leaving every day in that window as pure rest - each weekday still treats
// one subject (or two, on Friday) as "likely up next" using the same Mon-Literature/
// Tue-Physics/Wed-Methods/Thu-Specialist/Fri-PE&Music pattern as Week 5, and keeps that one
// light (flashcards + rest only). Every OTHER subject gets one bonus/optional revision session,
// continuing to cycle through its exam-weight-ordered topic list so the extra time is spent on
// genuinely useful content rather than nothing. If real per-subject exam dates come through,
// this can be swapped for an exact rest-day-per-subject schedule.
function examWeekdayIndex(d){
  let idx = 0;
  for(let c = new Date(EXAM_START); c < d; c.setDate(c.getDate()+1)){
    if(c.getDay()!==0 && c.getDay()!==6) idx++;
  }
  return idx;
}
function examPeriodTopic(s, idx){
  const list = getWeightedTopics(s);
  const i = idx % list.length;
  const passNum = Math.floor(idx / list.length);
  const [unit, topic, ref] = list[i];
  return {unit, topic, ref, passNum};
}

function dayPlan(d){
  const wd = d.getDay(); // 0=Sun..6=Sat
  const isExam = d >= EXAM_START && d <= END;
  const isWeekend = wd===0 || wd===6;
  const isWeek5 = d >= WEEK5_START && d < EXAM_START;
  const weekNum = weekNumFor(d);

  if(isExam){
    if(wd===0 || wd===6){
      return {phase:"Exam period", blocks:[{subject:"Rest day", color:"#4ade80",
        items:["No scheduled study &mdash; rest and recharge","Light flashcard skim only if you want it"]}]};
    }
    const examSubjectToday = EXAM_DATE_SUBJECT[localDateKey(d)];
    const restSubjects = examSubjectToday ? [examSubjectToday] : [];
    const idx = examWeekdayIndex(d);
    const blocks = [];
    restSubjects.forEach(s=>{
      blocks.push({subject:s, color:SUBJECTS[s].color, session:"Exam day",
        items:["Flashcard / formula recap only - no new content","Confirm exam time & room, then rest"]});
    });
    Object.keys(SUBJECTS).filter(s=>!restSubjects.includes(s)).forEach(s=>{
      const et = examPeriodTopic(s, idx);
      const [lessonA] = lessonsForVisit(s, et.unit, et.topic, et.passNum);
      const tail = lessonA ? refTail(lessonA) : (et.ref ? ` &mdash; ${et.ref}` : "");
      blocks.push({subject:s, color:SUBJECTS[s].color, unit:et.unit, topic:et.topic, ref: lessonA?refTail(lessonA).replace(/^ &mdash; /,''):et.ref, session:"Extra study (optional)",
        items:[`Bonus revision &mdash; '${et.topic}${tail}'`]});
    });
    return {phase: restSubjects.length ? "Exam period - extra study" : "Exam period - revision", blocks};
  }
  if(wd===6 && isWeek5){
    return {phase:`Week ${weekNum} - past papers`, blocks:[{subject:"Weakest subject this week", color:"#4ade80",
      items:["Check the rings above - pick the lowest %","Practice its toughest &amp; highest-yield topics from this week (see Most exam-frequent topics above)","Update Dot-Point Tracker"]}]};
  }
  if(isWeekend && wd===0){
    // Mirrors the guide's Weekly Completion Checklist template.
    return {phase: isWeek5?`Week ${weekNum} - past papers`:"Weekly review", blocks:[{subject:"Weekly Completion Checklist", color:"#4ade80",
      items:["Light review - flashcard skim across everything","Confirm homework is submitted","Update exam & assignments breakdown","Update syllabus traffic lights (Dot-Point Tracker)","Plan next week's study","Write down any clarifying questions for next week"]}]};
  }
  if(isWeek5 && WEEKDAY_SUBJECT[wd]){
    const s = WEEKDAY_SUBJECT[wd];
    const items = topicCoverageItems(s);
    items.push("Mark against the QCAA marking guide", "Log score & reflect in Exam Planner");
    return {phase:`Week ${weekNum} - past papers`, blocks:[{subject:s, color:SUBJECTS[s].color, items}]};
  }
  if(isWeek5 && wd===5){
    return {phase:`Week ${weekNum} - past papers`, blocks:[
      {subject:"Physical Education", color:SUBJECTS["Physical Education"].color, items:[...topicCoverageItems("Physical Education"), "Mark & log in Exam Planner"]},
      {subject:"Music", color:SUBJECTS["Music"].color, items:[...topicCoverageItems("Music"), "Mark & log in Exam Planner"]}
    ]};
  }
  if((wd>=1 && wd<=5) || (wd===6 && !isWeek5)){
    // Every content-phase day (Mon-Sat, Sunday stays the rest day): all 3 big subjects
    // (Physics/Methods/Specialist) get a slot, plus 1 small-subject slot chosen by the
    // weighted rotation (see weightedSmallSubject above).
    const dayTopics = topicsUpTo(d);
    const idx = contentWeekdayIndex(d);
    const small = weightedSmallSubject(idx);
    const blocks = [];
    let minPass = 99;
    BIG3.forEach(s=>{
      const t = dayTopics[s];
      const topic = t ? t.topic : "this topic";
      const unit = t ? t.unit : "";
      const pnum = t ? t.passNum : 0;
      minPass = Math.min(minPass, pnum);
      const color = SUBJECTS[s].color;
      const [lessonA, lessonB] = t ? lessonsForVisit(s, unit, topic, pnum) : [null, null];
      const refA = lessonA ? refTail(lessonA).replace(/^ &mdash; /,'') : (t ? t.ref : null);
      const si = sessionsForPassHalfRef(pnum, topic, lessonA, lessonB);
      blocks.push({subject:s, color, unit, topic, ref:refA, session:"Session 1", items:si.s1});
      blocks.push({subject:s, color, unit, topic, ref:refA, session:"Session 2", items:si.s2});
      const r1 = priorTopicForSubject(s, d);
      if(r1) blocks.push({subject:s, color, unit:r1.unit, topic:r1.topic, ref:r1.ref, session:"Retrieval", retrieval:true,
        items:[`Quick recall &mdash; '${r1.topic}${refTail(r1.lessonRef)}'`]});
    });
    {
      const t = dayTopics[small];
      const topic = t ? t.topic : "this topic";
      const unit = t ? t.unit : "";
      const pnum = t ? t.passNum : 0;
      const color = SUBJECTS[small].color;
      const [lessonA, lessonB] = t ? lessonsForVisit(small, unit, topic, pnum) : [null, null];
      const refA = lessonA ? refTail(lessonA).replace(/^ &mdash; /,'') : (t ? t.ref : null);
      const si = sessionsForPassHalfRef(pnum, topic, lessonA, lessonB);
      blocks.push({subject:small, color, unit, topic, ref:refA, session:"Session 1", items:si.s1});
      blocks.push({subject:small, color, unit, topic, ref:refA, session:"Session 2", items:si.s2});
    }
    const y = yesterdaySubjectTopic(d);
    if(y && ![...BIG3,small].includes(y.subject)) blocks.push({subject:y.subject, color:SUBJECTS[y.subject].color, unit:y.unit, topic:y.topic, session:"Retrieval", retrieval:true,
      items:[`Interleaved recall &mdash; '${y.topic}' (${y.subject})`]});
    return {phase:`Week ${weekNum} - ${passLabel(minPass===99?0:minPass)}`, blocks};
  }
  return {phase:"-", blocks:[]};
}

function storeKey(){ return "studydash_v2"; } // bumped from v1 so progress restarts at 0 for the 12 Aug plan
function loadStore(){ try{ return JSON.parse(localStorage.getItem(storeKey())||"{}"); }catch(e){ return {}; } }
function saveStore(s){ localStorage.setItem(storeKey(), JSON.stringify(s)); }

function dayCompletion(d){
  const plan = dayPlan(d);
  const total = plan.blocks.reduce((n,b)=>n+b.items.length,0);
  if(total===0) return {total:0, done:0};
  const store = loadStore();
  const arr = store[iso(d)] || [];
  const done = arr.filter(Boolean).length;
  return {total, done};
}

function toggleItem(dateIso, idx){
  const store = loadStore();
  if(!store[dateIso]) store[dateIso] = [];
  store[dateIso][idx] = !store[dateIso][idx];
  saveStore(store);
}

// consecutive fully-complete days ending yesterday or today; also returns the ISO
// dates that make up the run so the heatmap can highlight the active streak.
function computeStreak(){
  const today = new Date(); today.setHours(0,0,0,0);
  let streak = 0;
  const days = [];
  let cursor = new Date(Math.min(today, END));
  while(cursor >= START){
    const c = dayCompletion(new Date(cursor));
    if(c.total>0 && c.done===c.total){ streak++; days.push(iso(cursor)); cursor.setDate(cursor.getDate()-1); }
    else break;
  }
  return {streak, days};
}

// ---- animated number count-up ----
function animateValue(el, to, suffix){
  suffix = suffix || "";
  const from = 0;
  const dur = 650;
  const start = performance.now();
  function step(now){
    const p = Math.min(1, (now-start)/dur);
    const eased = 1 - Math.pow(1-p, 3);
    const val = Math.round(from + (to-from)*eased);
    el.innerHTML = suffix ? `${val}<span>${suffix}</span>` : `${val}`;
    if(p<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---- Toasts & milestone celebrations ----
function showToast(title, body, color){
  const stack = document.getElementById('toastStack');
  if(!stack) return;
  const t = document.createElement('div');
  t.className = 'toast';
  if(color) t.style.borderLeftColor = color;
  t.innerHTML = `<div class="t-title">${title}</div><div class="t-body">${body}</div>`;
  stack.appendChild(t);
  setTimeout(()=>{
    t.classList.add('out');
    setTimeout(()=>t.remove(), 320);
  }, 4200);
}
function checkMilestone(subject, pct, color){
  const key = 'studydash_milestones_v2';
  let store = {}; try{ store = JSON.parse(localStorage.getItem(key)||'{}'); }catch(e){}
  const thresholds = [25,50,75,100];
  const prevBest = store[subject] || 0;
  let newBest = prevBest;
  thresholds.forEach(th=>{
    if(pct>=th && prevBest<th){
      newBest = Math.max(newBest, th);
      const title = th===100 ? "Subject complete" : `${th}% milestone`;
      const body = th===100 ? `${subject} is fully covered so far &mdash; keep the reps up.` : `${subject} has crossed ${th}% coverage.`;
      showToast(`&#127881; ${title}`, body, color);
    }
  });
  if(newBest !== prevBest){ store[subject] = newBest; localStorage.setItem(key, JSON.stringify(store)); }
}
function updateStreakRisk(streak){
  const today = new Date(); today.setHours(0,0,0,0);
  const banner = document.getElementById('streakRisk');
  if(!banner) return;
  if(today < START || today > END){ banner.classList.remove('show'); return; }
  const c = dayCompletion(today);
  const todayDone = c.total>0 && c.done===c.total;
  const show = streak>0 && !todayDone && c.total>0;
  banner.classList.toggle('show', show);
  if(show) document.getElementById('streakRiskDays').textContent = streak;
}

// ---- Today panel ----