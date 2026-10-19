
import { createClient } from '@supabase/supabase-js';

// ========================================
// DELULU'S WORLD — SUPABASE CONFIGURATION
// ========================================
const SUPABASE_URL = 'https://imhxiljqhnenhkgbedxj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sDCXNbfAhU4MFaZc18YTIA_f3glPpf-';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========================================
// APP STATE
// ========================================
const $ = (id) => document.getElementById(id);

let mode = 'login';
let user = null;
let userRole = 'user';
let questions = [];
let current = 0;
let selected = {};
let submitted = false;

const letters = ['A', 'B', 'C', 'D'];

// ========================================
// HELPERS
// ========================================
function say(id, message, error = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = error ? '#ffaaaa' : 'var(--accent)';
}

function toast(message) {
  const el = $('toast');
  if (!el) {
    console.log(message);
    return;
  }
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function show(id, visible = true) {
  const el = $(id);
  if (el) el.classList.toggle('hidden', !visible);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function weekStartISO() {
  const now = new Date();
  const india = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );
  const day = (india.getDay() + 6) % 7;
  india.setDate(india.getDate() - day);
  india.setHours(0, 0, 0, 0);

  return [
    india.getFullYear(),
    String(india.getMonth() + 1).padStart(2, '0'),
    String(india.getDate()).padStart(2, '0')
  ].join('-');
}

function weekLabel() {
  const start = new Date(`${weekStartISO()}T00:00:00+05:30`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return `${start.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata'
  })} – ${end.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  })}`;
}

// ========================================
// LOGIN / SIGNUP
// ========================================
function setMode(nextMode) {
  mode = nextMode;

  show('name-wrap', mode === 'signup');

  $('login-tab')?.classList.toggle('active', mode === 'login');
  $('signup-tab')?.classList.toggle('active', mode === 'signup');

  const submit = $('auth-submit');
  if (submit) {
    submit.innerHTML = mode === 'login'
      ? 'Log in <span>→</span>'
      : 'Create account <span>→</span>';
  }

  const password = $('password');
  if (password) {
    password.autocomplete = mode === 'login'
      ? 'current-password'
      : 'new-password';
  }

  say('auth-message', '');
}

$('login-tab')?.addEventListener('click', () => setMode('login'));
$('signup-tab')?.addEventListener('click', () => setMode('signup'));

$('auth-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = $('email')?.value.trim();
  const password = $('password')?.value;
  const name = $('full-name')?.value.trim();

  if (!email || !password) {
    say('auth-message', 'Enter your email and password.', true);
    return;
  }

  say('auth-message', 'Please wait…');

  try {
    let result;

    if (mode === 'signup') {
      if (!name) {
        say('auth-message', 'Please enter your full name.', true);
        return;
      }

      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name }
        }
      });
    } else {
      result = await supabase.auth.signInWithPassword({
        email,
        password
      });
    }

    if (result.error) {
      say('auth-message', result.error.message, true);
      return;
    }

    if (mode === 'signup' && !result.data.session) {
      say(
        'auth-message',
        'Account created. Check your email to confirm, then log in.'
      );
      return;
    }

    say('auth-message', '');
    toast(mode === 'signup' ? 'Account created' : 'Welcome back');

    await loadSession();
  } catch (error) {
    say('auth-message', error.message || 'Authentication failed.', true);
  }
});

// ========================================
// SESSION & ROLE
// ========================================
function renderSignedOut() {
  user = null;
  userRole = 'user';

  show('auth-panel', true);
  show('app-panel', false);
  show('logout-btn', false);
  show('admin-panel', false);

  if ($('user-label')) $('user-label').textContent = '';
}

$('logout-btn')?.addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    toast(error.message);
    return;
  }

  renderSignedOut();
});

async function loadSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    renderSignedOut();
    return;
  }

  user = data.session?.user || null;

  if (!user) {
    renderSignedOut();
    return;
  }

  show('auth-panel', false);
  show('app-panel', true);
  show('logout-btn', true);
  show('admin-panel', false);

  if ($('user-label')) {
    $('user-label').textContent =
      user.user_metadata?.full_name || user.email || 'Student';
  }

  await loadRoleAndData();
}

async function loadRoleAndData() {
  // Hide the admin panel until the role has been checked.
  show('admin-panel', false);
  userRole = 'user';

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Profile error:', error);
    toast('Could not verify your account role.');
  } else if (profile) {
    userRole = String(profile.role || 'user').trim().toLowerCase();

    if (profile.display_name && $('user-label')) {
      $('user-label').textContent = profile.display_name;
    }
  }

  // Only show the admin interface to a profile marked admin.
  show('admin-panel', userRole === 'admin');

  await Promise.all([
    loadQuestions(),
    loadLeaderboard(),
    loadArchive()
  ]);

  if (userRole === 'admin') {
    await loadAdminQuestions();
  }
}

// ========================================
// LOAD QUIZ QUESTIONS
// ========================================
async function loadQuestions() {
  const host = $('quiz-content');
  if (!host) return;

  host.innerHTML = '<p class="muted">Loading questions…</p>';

  // Do not filter by is_published here:
  // that column is not exposed by the public_questions view.
  const { data, error } = await supabase
    .from('public_questions')
    .select('id, question_text, options, points, week_start, created_at')
    .eq('week_start', weekStartISO())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Question loading error:', error);
    host.innerHTML = `
      <div class="empty">
        <h3>Questions could not load</h3>
        <p>${escapeHtml(error.message)}</p>
        <button class="btn btn-primary" id="retry-questions">
          Try again →
        </button>
      </div>
    `;

    $('retry-questions')?.addEventListener('click', loadQuestions);
    return;
  }

  questions = (data || []).filter((q) =>
    q &&
    q.question_text &&
    Array.isArray(q.options) &&
    q.options.length >= 2
  );

  current = 0;
  selected = {};
  submitted = false;

  renderQuestion();
}

function renderQuestion() {
  const host = $('quiz-content');
  if (!host) return;

  if (!questions.length) {
    host.innerHTML = `
      <div class="empty">
        <div class="empty-icon">◎</div>
        <h3>No questions available this week</h3>
        <p>Questions may exist in the database but have a different week_start date, or the public view may not include them.</p>
        <button class="btn btn-primary" id="retry-questions">
          Reload questions →
        </button>
      </div>
    `;

    $('retry-questions')?.addEventListener('click', loadQuestions);
    return;
  }

  if (submitted) {
    host.innerHTML = `
      <div class="empty">
        <div class="empty-icon">✦</div>
        <h3>Quiz submitted</h3>
        <p>Your answers have been recorded. Check the leaderboard for your standing.</p>
        <button class="btn btn-primary" id="refresh-board">
          Refresh leaderboard →
        </button>
      </div>
    `;

    $('refresh-board')?.addEventListener('click', loadLeaderboard);
    return;
  }

  const question = questions[current];
  const options = question.options;

  host.innerHTML = `
    <div class="question-card">
      <div class="question-meta">
        <span>QUESTION ${current + 1} OF ${questions.length}</span>
        <span>${Number(question.points) || 1} point${Number(question.points) === 1 ? '' : 's'}</span>
      </div>

      <h3>${escapeHtml(question.question_text)}</h3>

      <div class="answers">
        ${options.map((option, index) => `
          <button
            type="button"
            class="answer ${selected[question.id] === index ? 'selected' : ''}"
            data-index="${index}"
          >
            <span class="letter">${letters[index] || index + 1}</span>
            <span>${escapeHtml(option)}</span>
          </button>
        `).join('')}
      </div>

      <div class="quiz-controls">
        <span class="quiz-progress">
          ${Object.keys(selected).length} answered
        </span>
        <button id="next-question" class="btn btn-primary">
          ${current === questions.length - 1 ? 'Submit quiz' : 'Next question'}
          <span>→</span>
        </button>
      </div>
    </div>
  `;

  host.querySelectorAll('.answer').forEach((button) => {
    button.addEventListener('click', () => {
      selected[question.id] = Number(button.dataset.index);
      renderQuestion();
    });
  });

  $('next-question')?.addEventListener('click', async () => {
    if (selected[question.id] === undefined) {
      toast('Choose an answer first');
      return;
    }

    if (current < questions.length - 1) {
      current++;
      renderQuestion();
    } else {
      await submitQuiz();
    }
  });
}

// ========================================
// SUBMIT QUIZ
// ========================================
async function submitQuiz() {
  const button = $('next-question');
  if (button) button.disabled = true;

  const answers = questions.map((question) => ({
    question_id: question.id,
    selected_option: selected[question.id]
  }));

  try {
    const { data, error } = await supabase.rpc('submit_quiz', {
      p_week_start: weekStartISO(),
      p_answers: answers
    });

    if (error) {
      console.error('Quiz submission error:', error);
      toast('Could not submit: ' + error.message);
      if (button) button.disabled = false;
      return;
    }

    submitted = true;
    renderQuestion();
    toast(`Quiz submitted · ${data?.points_earned ?? 0} points earned`);

    await loadLeaderboard();
  } catch (error) {
    toast(error.message || 'Quiz submission failed.');
    if (button) button.disabled = false;
  }
}

// ========================================
// LEADERBOARD
// ========================================
async function loadLeaderboard() {
  const host = $('leaderboard');
  if (!host) return;

  const { data, error } = await supabase.rpc('weekly_leaderboard', {
    p_week_start: weekStartISO()
  });

  if (error) {
    console.error('Leaderboard error:', error);
    host.innerHTML = '<p class="muted">Leaderboard is unavailable right now.</p>';
    return;
  }

  if (!data?.length) {
    host.innerHTML = '<p class="muted">No scores yet this week. Be the first to play!</p>';
    return;
  }

  host.innerHTML = data.slice(0, 10).map((row, index) => `
    <div class="leader-row">
      <span class="rank ${index < 3 ? 'top' : ''}">
        ${String(index + 1).padStart(2, '0')}
      </span>
      <div>
        <div class="player-name">
          ${escapeHtml(row.display_name || 'Student')}
        </div>
        <div class="player-sub">
          ${row.attempts} attempt${row.attempts === 1 ? '' : 's'}
        </div>
      </div>
      <span class="score">${Number(row.total_points) || 0} pts</span>
    </div>
  `).join('');
}

// ========================================
// WINNERS ARCHIVE
// ========================================
async function loadArchive() {
  const host = $('archive');
  if (!host) return;

  const { data, error } = await supabase
    .from('weekly_winners')
    .select('week_start, winner_name, winner_points')
    .order('week_start', { ascending: false })
    .limit(12);

  if (error || !data?.length) {
    host.innerHTML = '<p class="muted">No archived weeks yet.</p>';
    return;
  }

  host.innerHTML = data.map((row) => `
    <div class="archive-item">
      <span>
        <span class="muted">${escapeHtml(row.week_start)}</span><br>
        <strong>${escapeHtml(row.winner_name || 'Student')}</strong>
      </span>
      <b>${Number(row.winner_points) || 0} pts</b>
    </div>
  `).join('');
}

// ========================================
// ADMIN: ADD QUESTION
// ========================================
$('question-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!user || userRole !== 'admin') {
    say('admin-message', 'Admin access required.', true);
    return;
  }

  const questionText = $('q-text')?.value.trim();
  const options = [
    $('opt-a')?.value.trim(),
    $('opt-b')?.value.trim(),
    $('opt-c')?.value.trim(),
    $('opt-d')?.value.trim()
  ];

  if (!questionText || options.some((option) => !option)) {
    say('admin-message', 'Fill in the question and all four options.', true);
    return;
  }

  const payload = {
    question_text: questionText,
    options,
    correct_option: Number($('correct-opt')?.value),
    points: Number($('points')?.value) || 1,
    week_start: weekStartISO(),
    is_published: true,
    created_by: user.id
  };

  say('admin-message', 'Saving question…');

  const { error } = await supabase.from('questions').insert(payload);

  if (error) {
    console.error('Add question error:', error);
    say('admin-message', error.message, true);
    return;
  }

  event.target.reset();

  if ($('points')) $('points').value = 1;

  say('admin-message', 'Question added successfully.');
  await loadQuestions();
  await loadAdminQuestions();
});

// ========================================
// ADMIN: LIST & DELETE QUESTIONS
// ========================================
async function loadAdminQuestions() {
  const host = $('admin-question-list');
  if (!host) return;

  if (!user || userRole !== 'admin') {
    host.innerHTML = '';
    return;
  }

  const { data, error } = await supabase
    .from('questions')
    .select('id, question_text, is_published')
    .eq('week_start', weekStartISO())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Admin question list error:', error);
    host.innerHTML = '<p class="muted">Could not load admin questions. Check database permissions.</p>';
    return;
  }

  if (!data?.length) {
    host.innerHTML = '<p class="muted">No questions created for this week yet.</p>';
    return;
  }

  host.innerHTML = data.map((question) => `
    <div class="admin-question">
      <span>
        ${escapeHtml(question.question_text)}
        <span class="muted">
          · ${question.is_published ? 'Published' : 'Draft'}
        </span>
      </span>
      <button type="button" data-delete="${escapeHtml(question.id)}">
        Delete
      </button>
    </div>
  `).join('');

  host.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!user || userRole !== 'admin') {
        toast('Admin access required.');
        return;
      }

      if (!confirm('Delete this question?')) return;

      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', button.dataset.delete);

      if (error) {
        toast('Delete failed: ' + error.message);
        return;
      }

      toast('Question deleted');
      await loadQuestions();
      await loadAdminQuestions();
    });
  });
}

// ========================================
// START APP
// ========================================
if ($('week-label')) {
  $('week-label').textContent = weekLabel();
}

setMode('login');

supabase.auth.onAuthStateChange(() => {
  // Delay avoids running Supabase queries inside the auth callback.
  setTimeout(() => loadSession(), 0);
});

loadSession();
