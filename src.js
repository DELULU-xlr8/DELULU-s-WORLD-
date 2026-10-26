
import { createClient } from '@supabase/supabase-js';

// Supabase public credentials
const SUPABASE_URL = 'https://imhxiljqhnenhkgbedxj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sDCXNbfAhU4MFaZc18YTIA_f3glPpf';

const configured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('https://imhxiljqhnenhkgbedxj.supabase.co') &&
  !SUPABASE_ANON_KEY.includes('sb_publishable_sDCXNbfAhU4MFaZc18YTIA_f3glPpf');

const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const $ = (id) => document.getElementById(id);

let mode = 'login';
let user = null;
let questions = [];
let current = 0;
let selected = {};
let submitted = false;

let quizStarted = false;
let quizLocked = false;
let violationInProgress = false;
let violationDetected = false;

const letters = ['A', 'B', 'C', 'D'];

const say = (id, msg, error = false) => {
  const el = $(id);
  if (el) {
    el.textContent = msg;
    el.style.color = error ? '#ffaaaa' : 'var(--accent)';
  }
};

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function show(id, yes = true) {
  const el = $(id);
  if (el) el.classList.toggle('hidden', !yes);
}

function escapeHtml(v = '') {
  return String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function weekStartISO() {
  const d = new Date(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata'
    })
  );
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekLabel() {
  const d = new Date(`${weekStartISO()}T00:00:00+05:30`);
  const e = new Date(d);
  e.setDate(e.getDate() + 6);

  return `${d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata'
  })} – ${e.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  })}`;
}

if ($('week-label')) $('week-label').textContent = weekLabel();

function setMode(next) {
  mode = next;
  $('login-tab').classList.toggle('active', mode === 'login');
  $('signup-tab').classList.toggle('active', mode === 'signup');
  show('name-wrap', mode === 'signup');

  $('auth-submit').innerHTML = mode === 'login'
    ? 'Log in <span>→</span>'
    : 'Create account <span>→</span>';

  $('password').autocomplete = mode === 'login'
    ? 'current-password'
    : 'new-password';

  say('auth-message', '');
}

$('login-tab').addEventListener('click', () => setMode('login'));
$('signup-tab').addEventListener('click', () => setMode('signup'));

$('auth-form').addEventListener('submit', async e => {
  e.preventDefault();

  if (!supabase) {
    return say('auth-message', 'Add Supabase URL and public key in src.js.', true);
  }

  say('auth-message', 'Please wait…');

  const email = $('email').value.trim();
  const password = $('password').value;
  const name = $('full-name').value.trim();

  let result;

  if (mode === 'signup') {
    if (!name) return say('auth-message', 'Please enter your full name.', true);

    result = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });
  } else {
    result = await supabase.auth.signInWithPassword({ email, password });
  }

  if (result.error) {
    return say('auth-message', result.error.message, true);
  }

  if (mode === 'signup' && !result.data.session) {
    say('auth-message', 'Account created. Confirm your email, then log in.');
    return;
  }

  say('auth-message', '');
  toast(mode === 'signup' ? 'Account created' : 'Welcome back');
  await loadSession();
});

$('logout-btn').addEventListener('click', async () => {
  if (supabase) await supabase.auth.signOut();
  user = null;
  renderSignedOut();
});

function renderSignedOut() {
  show('auth-panel', true);
  show('app-panel', false);
  show('logout-btn', false);
  if ($('user-label')) $('user-label').textContent = '';
}

async function loadSession() {
  if (!supabase) return;

  const { data } = await supabase.auth.getSession();
  user = data.session?.user || null;

  if (!user) {
    renderSignedOut();
    return;
  }

  show('auth-panel', false);
  show('app-panel', true);
  show('logout-btn', true);
  $('user-label').textContent = user.user_metadata?.full_name || user.email;

  await loadRoleAndData();
}

async function loadRoleAndData() {
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name,role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.display_name) {
    $('user-label').textContent = profile.display_name;
  }

  show('admin-panel', profile?.role === 'admin');

  await Promise.all([
    loadQuestions(),
    loadLeaderboard(),
    loadArchive()
  ]);

  if (profile?.role === 'admin') {
    await loadAdminQuestions();
  }
}

// PRE-QUIZ WARNING
function renderQuizWarning() {
  const host = $('quiz-content');

  if (!questions.length) {
    renderQuestion();
    return;
  }

  quizStarted = false;
  quizLocked = false;
  violationDetected = false;

  host.innerHTML = `
    <div class="empty">
      <div class="empty-icon">⚠</div>
      <h3>Quiz Rules & Anti-Cheating</h3>
      <p>
        Do not switch apps, leave this tab, or navigate away
        during the quiz. The first detected departure may
        automatically submit your answers and flag your account.
      </p>
      <p>Make sure you are ready before starting.</p>
      <button class="btn btn-primary" id="start-quiz">
        I Understand — Start Quiz →
      </button>
    </div>
  `;

  $('start-quiz').onclick = () => {
    quizStarted = true;
    quizLocked = false;
    renderQuestion();
  };
}

async function loadQuestions() {
  const { data, error } = await supabase
    .from('public_questions')
    .select('id,question_text,options,points,week_start')
    .eq('week_start', weekStartISO())
    .eq('is_published', true)
    .order('created_at');

  if (error) {
    $('quiz-content').innerHTML =
      '<p class="muted">Could not load questions. Check database setup and access policies.</p>';
    return;
  }

  questions = data || [];
  current = 0;
  selected = {};
  submitted = false;
  quizStarted = false;
  quizLocked = false;
  violationInProgress = false;
  violationDetected = false;

  renderQuizWarning();
}

function renderQuestion() {
  const host = $('quiz-content');

  if (!questions.length) {
    host.innerHTML = `
      <div class="empty">
        <div class="empty-icon">◎</div>
        <h3>Questions are on the way</h3>
        <p>The quiz administrator hasn’t published this week’s questions yet.</p>
      </div>`;
    return;
  }

  if (submitted) {
    host.innerHTML = `
      <div class="empty">
        <div class="empty-icon">✦</div>
        <h3>Quiz submitted</h3>
        <p>Your answers have been recorded. Check the leaderboard.</p>
        <button class="btn btn-primary" id="refresh-board">
          Refresh leaderboard →
        </button>
      </div>`;

    $('refresh-board').onclick = loadLeaderboard;
    return;
  }

  if (!quizStarted) {
    renderQuizWarning();
    return;
  }

  const q = questions[current];

  host.innerHTML = `
    <div class="question-card">
      <div class="question-meta">
        <span>QUESTION ${current + 1} OF ${questions.length}</span>
        <span>${q.points} point${q.points === 1 ? '' : 's'}</span>
      </div>
      <h3>${escapeHtml(q.question_text)}</h3>
      <div class="answers">
        ${q.options.map((opt, i) => `
          <button class="answer ${selected[q.id] === i ? 'selected' : ''}"
            data-index="${i}" ${quizLocked ? 'disabled' : ''}>
            <span class="letter">${letters[i]}</span>
            <span>${escapeHtml(opt)}</span>
          </button>
        `).join('')}
      </div>
      <div class="quiz-controls">
        <span class="quiz-progress">
          ${Object.keys(selected).length} answered
        </span>
        <button id="next-question" class="btn btn-primary"
          ${quizLocked ? 'disabled' : ''}>
          ${current === questions.length - 1 ? 'Submit quiz' : 'Next question'}
          <span>→</span>
        </button>
      </div>
    </div>`;

  host.querySelectorAll('.answer').forEach(b => {
    b.addEventListener('click', () => {
      if (quizLocked || submitted) return;
      selected[q.id] = Number(b.dataset.index);
      renderQuestion();
    });
  });

  $('next-question').onclick = async () => {
    if (quizLocked || submitted) return;
    if (selected[q.id] === undefined) {
      return toast('Choose an answer first');
    }

    if (current < questions.length - 1) {
      current++;
      renderQuestion();
    } else {
      await submitQuiz();
    }
  };
}

// Record the first violation
async function recordViolation() {
  if (!supabase || !user) return;

  const { error } = await supabase
    .from('quiz_violations')
    .upsert({
      user_id: user.id,
      week_start: weekStartISO(),
      reason: 'tab_or_app_switch'
    }, {
      onConflict: 'user_id,week_start',
      ignoreDuplicates: true
    });

  if (error) {
    console.error('Could not record quiz violation:', error.message);
    toast('Warning: violation could not be recorded.');
  }
}

// First detected tab/app departure: lock and auto-submit
async function handleQuizViolation() {
  if (
    !quizStarted ||
    submitted ||
    quizLocked ||
    violationInProgress ||
    violationDetected ||
    !questions.length ||
    !user
  ) return;

  violationInProgress = true;
  violationDetected = true;
  quizLocked = true;

  toast('CHEATING WARNING: quiz is being submitted.');

  try {
    await recordViolation();
    await submitQuiz(true);
  } finally {
    violationInProgress = false;
  }
}

// Detect tab hiding and window losing focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    handleQuizViolation();
  }
});

window.addEventListener('blur', () => {
  handleQuizViolation();
});

// Submit normal or violation-triggered attempt
async function submitQuiz(auto = false) {
  if (!supabase || !user || submitted) return;

  const btn = $('next-question');
  if (btn) btn.disabled = true;

  // Only send answers the student actually selected.
  const answers = questions
    .filter(q => selected[q.id] !== undefined)
    .map(q => ({
      question_id: q.id,
      selected_option: selected[q.id]
    }));

  if (!auto && answers.length !== questions.length) {
    if (btn) btn.disabled = false;
    return toast('Answer every question before submitting.');
  }

  const { data, error } = await supabase.rpc('submit_quiz', {
    p_week_start: weekStartISO(),
    p_answers: answers
  });

  if (error) {
    console.error('Quiz submission failed:', error.message);
    toast('Could not submit: ' + error.message);

    // Keep the quiz locked after a violation.
    if (!auto && btn) btn.disabled = false;
    return;
  }

  submitted = true;
  quizLocked = true;
  quizStarted = false;

  renderQuestion();

  if (auto) {
    toast('Attempt auto-submitted. Violation recorded.');
  } else {
    toast(`Quiz submitted · ${data?.points_earned ?? 0} points earned`);
  }

  await loadLeaderboard();
}

async function loadLeaderboard() {
  const host = $('leaderboard');

  const [{ data, error }, { data: violations, error: violationError }] =
    await Promise.all([
      supabase.rpc('weekly_leaderboard', {
        p_week_start: weekStartISO()
      }),
      supabase
        .from('quiz_violations')
        .select('user_id')
        .eq('week_start', weekStartISO())
    ]);

  if (error) {
    host.innerHTML =
      '<p class="muted">Leaderboard will appear after database setup.</p>';
    return;
  }

  if (violationError) {
    console.error('Could not load violation list:', violationError.message);
  }

  const cheaterIds = new Set(
    (violations || []).map(v => v.user_id)
  );

  if (!data?.length) {
    host.innerHTML =
      '<p class="muted">No scores yet this week. Be the first to play!</p>';
    return;
  }

  host.innerHTML = data.slice(0, 10).map((r, i) => {
    const flagged = r.user_id && cheaterIds.has(r.user_id);

    return `
      <div class="leader-row">
        <span class="rank ${i < 3 ? 'top' : ''}">
          ${String(i + 1).padStart(2, '0')}
        </span>
        <div>
          <div class="player-name">
            ${escapeHtml(r.display_name || 'Student')}
            ${flagged
              ? '<span style="color:#ff3030;font-weight:800;margin-left:6px;">CHEATER</span>'
              : ''}
          </div>
          <div class="player-sub">
            ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}
          </div>
        </div>
        <span class="score">${r.total_points} pts</span>
      </div>`;
  }).join('');
}

async function loadArchive() {
  const host = $('archive');

  const { data, error } = await supabase
    .from('weekly_winners')
    .select('week_start,winner_name,winner_points')
    .order('week_start', { ascending: false })
    .limit(12);

  if (error || !data?.length) {
    host.innerHTML =
      '<p class="muted">No archived weeks yet. Winners appear after a week is closed and archived.</p>';
    return;
  }

  host.innerHTML = data.map(r => `
    <div class="archive-item">
      <span>
        <span class="muted">${escapeHtml(r.week_start)}</span><br>
        <strong>${escapeHtml(r.winner_name)}</strong>
      </span>
      <b>${r.winner_points} pts</b>
    </div>
  `).join('');
}

$('question-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!supabase || !user) return;

  const payload = {
    question_text: $('q-text').value.trim(),
    options: [
      $('opt-a').value.trim(),
      $('opt-b').value.trim(),
      $('opt-c').value.trim(),
      $('opt-d').value.trim()
    ],
    correct_option: Number($('correct-opt').value),
    points: Number($('points').value),
    week_start: weekStartISO(),
    is_published: true,
    created_by: user.id
  };

  const { error } = await supabase.from('questions').insert(payload);

  if (error) {
    say('admin-message', error.message, true);
    return;
  }

  e.target.reset();
  $('points').value = 1;
  say('admin-message', 'Question added and published.');

  await loadQuestions();
  await loadAdminQuestions();
});

async function loadAdminQuestions() {
  const host = $('admin-question-list');

  const { data, error } = await supabase
    .from('questions')
    .select('id,question_text,is_published')
    .eq('week_start', weekStartISO())
    .order('created_at');

  if (error) {
    host.innerHTML =
      '<p class="muted">Could not load admin question list.</p>';
    return;
  }

  host.innerHTML = (data || []).map(q => `
    <div class="admin-question">
      <span>
        ${escapeHtml(q.question_text)}
        <span class="muted">· ${q.is_published ? 'Published' : 'Draft'}</span>
      </span>
      <button data-delete="${q.id}">Delete</button>
    </div>
  `).join('');

  host.querySelectorAll('[data-delete]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Delete this question?')) return;

      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', b.dataset.delete);

      if (error) {
        toast(error.message);
      } else {
        toast('Question deleted');
        await loadQuestions();
        await loadAdminQuestions();
      }
    };
  });
}

if (!configured) {
  show('auth-panel', true);
  say(
    'auth-message',
    'Setup required: add your Supabase Project URL and public key in src.js.',
    true
  );
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null;
    setTimeout(() => loadSession(), 0);
  });

  loadSession();
}
