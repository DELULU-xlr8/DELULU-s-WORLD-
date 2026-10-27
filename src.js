import { createClient } from '@supabase/supabase-js';

// DELULU'S WORLD — Supabase Configuration
const SUPABASE_URL = 'https://imhxiljqhnenhkgbedxj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sDCXNbfAhU4MFaZc18YTIA_f3glPpf-';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

let mode = 'login';
let user = null;
let questions = [];
let current = 0;
let selected = {};
let submitted = false;
let loadingSession = false;
let sessionToken = 0;

const letters = ['A', 'B', 'C', 'D'];

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

  setTimeout(() => {
    el.classList.remove('show');
  }, 2600);
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

// Monday-starting week, using Indian Standard Time.
function weekStartISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const values = {};
  parts.forEach((part) => {
    values[part.type] = part.value;
  });

  const date = new Date(
    `${values.year}-${values.month}-${values.day}T00:00:00+05:30`
  );

  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function weekLabel() {
  const start = new Date(`${weekStartISO()}T00:00:00+05:30`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const format = (date, options) =>
    new Intl.DateTimeFormat('en-IN', {
      ...options,
      timeZone: 'Asia/Kolkata'
    }).format(date);

  const label = $('week-label');
  if (label) {
    label.textContent =
      `${format(start, { day: 'numeric', month: 'short' })} – ` +
      `${format(end, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })}`;
  }
}

// ---------------- AUTH TABS ----------------

function setMode(nextMode) {
  mode = nextMode;

  $('login-tab')?.classList.toggle('active', mode === 'login');
  $('signup-tab')?.classList.toggle('active', mode === 'signup');

  show('name-wrap', mode === 'signup');

  const submit = $('auth-submit');
  if (submit) {
    submit.innerHTML = mode === 'login'
      ? 'Log in <span>→</span>'
      : 'Create account <span>→</span>';
  }

  const password = $('password');
  if (password) {
    password.autocomplete =
      mode === 'login' ? 'current-password' : 'new-password';
  }

  say('auth-message', '');
}

$('login-tab')?.addEventListener('click', () => setMode('login'));
$('signup-tab')?.addEventListener('click', () => setMode('signup'));

// ---------------- SIGNED-OUT SCREEN ----------------

function renderSignedOut() {
  show('auth-panel', true);
  show('app-panel', false);
  show('logout-btn', false);
  show('admin-panel', false);

  const userLabel = $('user-label');
  if (userLabel) userLabel.textContent = '';

  questions = [];
  current = 0;
  selected = {};
  submitted = false;
}

// ---------------- SIGNED-IN SCREEN ----------------

async function renderSignedIn(currentUser) {
  if (!currentUser) return;

  user = currentUser;

  show('auth-panel', false);
  show('app-panel', true);
  show('logout-btn', true);

  const label = $('user-label');
  if (label) {
    label.textContent =
      currentUser.user_metadata?.full_name ||
      currentUser.email ||
      'Student';
  }

  await loadRoleAndData(currentUser);
}

// ---------------- SESSION HANDLING ----------------

// Important: the auth listener does not call getSession() again.
// This avoids repeated session-loading loops.
async function loadSession() {
  if (loadingSession) return;

  loadingSession = true;
  const thisToken = ++sessionToken;

  try {
    const { data, error } = await supabase.auth.getSession();

    if (thisToken !== sessionToken) return;

    if (error) {
      console.error('Session error:', error);
      say('auth-message', error.message, true);
      renderSignedOut();
      return;
    }

    const currentUser = data.session?.user || null;

    if (!currentUser) {
      user = null;
      renderSignedOut();
      return;
    }

    await renderSignedIn(currentUser);
  } catch (error) {
    console.error('Could not load session:', error);
    say('auth-message', 'Could not load your session. Please refresh.', true);
  } finally {
    loadingSession = false;
  }
}

// ---------------- LOGIN AND SIGNUP ----------------

$('auth-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const submitButton = $('auth-submit');
  if (submitButton) submitButton.disabled = true;

  try {
    const email = $('email')?.value.trim();
    const password = $('password')?.value;
    const fullName = $('full-name')?.value.trim();

    if (!email || !password) {
      say('auth-message', 'Enter your email and password.', true);
      return;
    }

    if (mode === 'signup' && !fullName) {
      say('auth-message', 'Please enter your full name.', true);
      return;
    }

    say('auth-message', 'Please wait…');

    let result;

    if (mode === 'signup') {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            display_name: fullName
          },
          emailRedirectTo: 'https://delulus-world.netlify.app/'
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
        'Account created! Confirm your email, then return here and log in.'
      );
      return;
    }

    if (result.data.session?.user) {
      user = result.data.session.user;
      say('auth-message', '');
      toast(mode === 'signup' ? 'Account created!' : 'Welcome back!');
      await renderSignedIn(user);
    }
  } catch (error) {
    console.error('Authentication error:', error);
    say(
      'auth-message',
      error.message || 'Something went wrong. Please try again.',
      true
    );
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

// ---------------- LOGOUT ----------------

$('logout-btn')?.addEventListener('click', async () => {
  const button = $('logout-btn');
  if (button) button.disabled = true;

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast(error.message);
      return;
    }

    user = null;
    sessionToken++;
    renderSignedOut();
    toast('Logged out successfully.');
  } catch (error) {
    toast(error.message || 'Logout failed.');
  } finally {
    if (button) button.disabled = false;
  }
});

// ---------------- PROFILE, ROLE AND DATA ----------------

async function loadRoleAndData(currentUser) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, role')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.error('Profile error:', error);
  }

  if (profile?.display_name && $('user-label')) {
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

// ---------------- LOAD QUIZ QUESTIONS ----------------

async function loadQuestions() {
  const host = $('quiz-content');
  if (!host) return;

  const { data, error } = await supabase
    .from('public_questions')
    .select('id, question_text, options, points, week_start')
    .eq('week_start', weekStartISO())
    .eq('is_published', true)
    .order('created_at');

  if (error) {
    console.error('Question loading error:', error);
    host.innerHTML =
      '<p class="muted">Could not load questions. Check the database view and access policies.</p>';
    return;
  }

  questions = data || [];
  current = 0;
  selected = {};
  submitted = false;

  renderQuestion();
}

// ---------------- DISPLAY QUESTIONS ----------------

function renderQuestion() {
  const host = $('quiz-content');
  if (!host) return;

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
        <p>Your answers have been recorded. Check the leaderboard to see your standing.</p>
        <button class="btn btn-primary" id="refresh-board">
          Refresh leaderboard →
        </button>
      </div>`;

    $('refresh-board')?.addEventListener('click', loadLeaderboard);
    return;
  }

  const question = questions[current];
  const options = Array.isArray(question.options) ? question.options : [];

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
            data-index="${index}">
            <span class="letter">${letters[index] || ''}</span>
            <span>${escapeHtml(option)}</span>
          </button>
        `).join('')}
      </div>

      <div class="quiz-controls">
        <span class="quiz-progress">
          ${Object.keys(selected).length} answered
        </span>

        <button type="button" id="next-question" class="btn btn-primary">
          ${current === questions.length - 1 ? 'Submit quiz' : 'Next question'}
          <span>→</span>
        </button>
      </div>
    </div>`;

  host.querySelectorAll('.answer').forEach((button) => {
    button.addEventListener('click', () => {
      selected[question.id] = Number(button.dataset.index);
      renderQuestion();
    });
  });

  $('next-question')?.addEventListener('click', async () => {
    if (selected[question.id] === undefined) {
      toast('Choose an answer first.');
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

// ---------------- SUBMIT QUIZ ----------------

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

    const points = data?.points_earned ?? 0;
    toast(`Quiz submitted · ${points} points earned`);

    await loadLeaderboard();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Quiz submission failed.');
    if (button) button.disabled = false;
  }
}

// ---------------- LEADERBOARD ----------------

async function loadLeaderboard() {
  const host = $('leaderboard');
  if (!host) return;

  const { data, error } = await supabase.rpc('weekly_leaderboard', {
    p_week_start: weekStartISO()
  });

  if (error) {
    console.error('Leaderboard error:', error);
    host.innerHTML =
      '<p class="muted">Leaderboard will appear after database setup.</p>';
    return;
  }

  if (!data?.length) {
    host.innerHTML =
      '<p class="muted">No scores yet this week. Be the first to play!</p>';
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

// ---------------- WINNERS ARCHIVE ----------------

async function loadArchive() {
  const host = $('archive');
  if (!host) return;

  const { data, error } = await supabase
    .from('weekly_winners')
    .select('week_start, winner_name, winner_points')
    .order('week_start', { ascending: false })
    .limit(12);

  if (error || !data?.length) {
    host.innerHTML =
      '<p class="muted">No archived weeks yet. Winners appear after a week is closed and archived.</p>';
    return;
  }

  host.innerHTML = data.map((row) => `
    <div class="archive-item">
      <span>
        <span class="muted">${escapeHtml(row.week_start)}</span>
        <br>
        <strong>${escapeHtml(row.winner_name)}</strong>
      </span>
      <b>${Number(row.winner_points) || 0} pts</b>
    </div>
  `).join('');
}

// ---------------- ADD ADMIN QUESTION ----------------

$('question-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!user) {
    say('admin-message', 'Please log in again.', true);
    return;
  }

  const button = event.target.querySelector('[type="submit"]');
  if (button) button.disabled = true;

  try {
    const questionText = $('q-text')?.value.trim();
    const options = [
      $('opt-a')?.value.trim(),
      $('opt-b')?.value.trim(),
      $('opt-c')?.value.trim(),
      $('opt-d')?.value.trim()
    ];

    if (!questionText || options.some((option) => !option)) {
      say('admin-message', 'Enter the question and all four options.', true);
      return;
    }

    const correctOption = Number($('correct-opt')?.value);

    if (![0, 1, 2, 3].includes(correctOption)) {
      say('admin-message', 'Select the correct option.', true);
      return;
    }

    const payload = {
      question_text: questionText,
      options,
      correct_option: correctOption,
      points: Number($('points')?.value) || 1,
      week_start: weekStartISO(),
      is_published: true,
      created_by: user.id
    };

    const { error } = await supabase.from('questions').insert(payload);

    if (error) {
      console.error('Add question error:', error);
      say('admin-message', error.message, true);
      return;
    }

    event.target.reset();

    if ($('points')) $('points').value = 1;

    say('admin-message', 'Question added and published.');
    await loadQuestions();
    await loadAdminQuestions();
  } catch (error) {
    console.error(error);
    say('admin-message', error.message || 'Could not add question.', true);
  } finally {
    if (button) button.disabled = false;
  }
});

// ---------------- ADMIN QUESTION LIST ----------------

async function loadAdminQuestions() {
  const host = $('admin-question-list');
  if (!host) return;

  const { data, error } = await supabase
    .from('questions')
    .select('id, question_text, is_published')
    .eq('week_start', weekStartISO())
    .order('created_at');

  if (error) {
    console.error('Admin questions error:', error);
    host.innerHTML =
      '<p class="muted">Could not load admin question list.</p>';
    return;
  }

  host.innerHTML = (data || []).map((question) => `
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
      if (!confirm('Delete this question?')) return;

      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', button.dataset.delete);

      if (error) {
        toast(error.message);
        return;
      }

      toast('Question deleted.');
      await loadQuestions();
      await loadAdminQuestions();
    });
  });
}

// ---------------- INITIALISE APP ----------------

weekLabel();
setMode('login');
renderSignedOut();

// Load the existing session once.
loadSession();

// Handle auth events without recursively calling getSession().
// A short delay lets Supabase finish its internal auth event first.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    sessionToken++;
    user = null;
    renderSignedOut();
    return;
  }

  if (event === 'SIGNED_IN' && session?.user) {
    setTimeout(() => {
      if (user?.id !== session.user.id) {
        renderSignedIn(session.user);
      }
    }, 0);
  }
});