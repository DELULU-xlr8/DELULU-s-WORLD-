
import { createClient } from '@supabase/supabase-js';

// Supabase public project URL and publishable key
// Never put a service_role key in frontend code.
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

const letters = ['A', 'B', 'C', 'D'];

function say(id, message, error = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = error ? '#ffaaaa' : 'var(--accent)';
}

function show(id, visible = true) {
  const el = $(id);
  if (el) el.classList.toggle('hidden', !visible);
}

function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
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
  const local = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );

  const day = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - day);
  local.setHours(0, 0, 0, 0);

  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
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

if ($('week-label')) {
  $('week-label').textContent = weekLabel();
}

// ---------------- AUTH ----------------

function setMode(next) {
  mode = next;

  $('login-tab')?.classList.toggle('active', mode === 'login');
  $('signup-tab')?.classList.toggle('active', mode === 'signup');

  show('name-wrap', mode === 'signup');

  if ($('auth-submit')) {
    $('auth-submit').innerHTML =
      mode === 'login'
        ? 'Log in <span>→</span>'
        : 'Create account <span>→</span>';
  }

  if ($('password')) {
    $('password').autocomplete =
      mode === 'login' ? 'current-password' : 'new-password';
  }

  say('auth-message', '');
}

$('login-tab')?.addEventListener('click', () => setMode('login'));
$('signup-tab')?.addEventListener('click', () => setMode('signup'));

$('auth-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = $('email').value.trim();
  const password = $('password').value;
  const name = $('full-name')?.value.trim();

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

$('logout-btn')?.addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    toast(error.message);
    return;
  }

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
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    say('auth-message', error.message, true);
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

  if ($('user-label')) {
    $('user-label').textContent =
      user.user_metadata?.full_name || user.email || 'Student';
  }

  await loadRoleAndData();
}

async function loadRoleAndData() {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) console.error('Profile error:', error);

  if (profile?.display_name && $('user-label')) {
    $('user-label').textContent = profile.display_name;
  }

  const isAdmin = profile?.role === 'admin';
  show('admin-panel', isAdmin);

  await Promise.all([
    loadQuestions(),
    loadLeaderboard(),
    loadArchive()
  ]);

  if (isAdmin) await loadAdminQuestions();
}

// ---------------- WEEKLY QUIZ ----------------

async function loadQuestions() {
  const host = $('quiz-content');
  if (!host) return;

  host.innerHTML = '<p class="muted">Loading weekly quiz...</p>';

  try {
    // public_questions must expose only safe, published question fields.
    // Do not query correct_option from the browser.
    const { data, error } = await supabase
      .from('public_questions')
      .select('id,question_text,options,points,week_start,created_at')
      .eq('week_start', weekStartISO())
      .order('created_at');

    if (error) {
      console.error('Weekly quiz error:', error);

      host.innerHTML = `
        <div class="empty">
          <h3>Quiz loading error</h3>
          <p>${escapeHtml(error.message)}</p>
          <p>Code: ${escapeHtml(error.code || 'Unknown')}</p>
        </div>
      `;
      return;
    }

    questions = (data || []).filter((q) =>
      Array.isArray(q.options) && q.options.length === 4
    );

    current = 0;
    selected = {};
    submitted = false;

    renderQuestion();
  } catch (error) {
    console.error('Unexpected quiz error:', error);

    host.innerHTML = `
      <div class="empty">
        <h3>Quiz loading error</h3>
        <p>${escapeHtml(error.message || 'Unknown error')}</p>
      </div>
    `;
  }
}

function renderQuestion() {
  const host = $('quiz-content');
  if (!host) return;

  if (!questions.length) {
    host.innerHTML = `
      <div class="empty">
        <div class="empty-icon">◎</div>
        <h3>Questions are on the way</h3>
        <p>No published questions were found for this week.</p>
      </div>
    `;
    return;
  }

  if (submitted) {
    host.innerHTML = `
      <div class="empty">
        <div class="empty-icon">✦</div>
        <h3>Quiz submitted</h3>
        <p>Your answers have been recorded.</p>
        <button class="btn btn-primary" id="refresh-board">
          Refresh leaderboard →
        </button>
      </div>
    `;

    $('refresh-board')?.addEventListener('click', loadLeaderboard);
    return;
  }

  const q = questions[current];

  host.innerHTML = `
    <div class="question-card">
      <div class="question-meta">
        <span>QUESTION ${current + 1} OF ${questions.length}</span>
        <span>${Number(q.points) || 1} point${Number(q.points) === 1 ? '' : 's'}</span>
      </div>

      <h3>${escapeHtml(q.question_text)}</h3>

      <div class="answers">
        ${q.options.map((option, index) => `
          <button
            type="button"
            class="answer ${selected[q.id] === index ? 'selected' : ''}"
            data-index="${index}"
          >
            <span class="letter">${letters[index]}</span>
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
    </div>
  `;

  host.querySelectorAll('.answer').forEach((button) => {
    button.addEventListener('click', () => {
      selected[q.id] = Number(button.dataset.index);
      renderQuestion();
    });
  });

  $('next-question')?.addEventListener('click', async () => {
    if (selected[q.id] === undefined) {
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

async function submitQuiz() {
  const button = $('next-question');
  if (button) button.disabled = true;

  const answers = questions.map((q) => ({
    question_id: q.id,
    selected_option: selected[q.id]
  }));

  try {
    // This RPC must exist in Supabase and validate answers securely
    // on the server. Never calculate trusted scores in frontend code.
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

    if (data && typeof data.points_earned === 'number') {
      toast(`Quiz submitted · ${data.points_earned} points earned`);
    } else {
      toast('Quiz submitted');
    }

    await loadLeaderboard();
  } catch (error) {
    console.error('Unexpected submission error:', error);
    toast(error.message || 'Quiz submission failed');
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
      '<p class="muted">Leaderboard is unavailable. Check database setup.</p>';
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
          ${Number(row.attempts) || 0}
          attempt${Number(row.attempts) === 1 ? '' : 's'}
        </div>
      </div>
      <span class="score">${Number(row.total_points) || 0} pts</span>
    </div>
  `).join('');
}

// ---------------- WEEKLY ARCHIVE ----------------

async function loadArchive() {
  const host = $('archive');
  if (!host) return;

  const { data, error } = await supabase
    .from('weekly_winners')
    .select('week_start,winner_name,winner_points')
    .order('week_start', { ascending: false })
    .limit(12);

  if (error) {
    console.error('Archive error:', error);
    host.innerHTML =
      '<p class="muted">Archive is currently unavailable.</p>';
    return;
  }

  if (!data?.length) {
    host.innerHTML =
      '<p class="muted">No archived weeks yet.</p>';
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

// ---------------- ADMIN: ADD QUESTION ----------------

$('question-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!user) {
    say('admin-message', 'Please log in first.', true);
    return;
  }

  const questionText = $('q-text').value.trim();
  const options = [
    $('opt-a').value.trim(),
    $('opt-b').value.trim(),
    $('opt-c').value.trim(),
    $('opt-d').value.trim()
  ];

  if (!questionText || options.some((option) => !option)) {
    say('admin-message', 'Fill in the question and all four options.', true);
    return;
  }

  const payload = {
    question_text: questionText,
    options,
    correct_option: Number($('correct-opt').value),
    points: Number($('points').value) || 1,
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
});

// ---------------- ADMIN: QUESTION LIST ----------------

async function loadAdminQuestions() {
  const host = $('admin-question-list');
  if (!host) return;

  const { data, error } = await supabase
    .from('questions')
    .select('id,question_text,is_published')
    .eq('week_start', weekStartISO())
    .order('created_at');

  if (error) {
    console.error('Admin questions error:', error);
    host.innerHTML =
      '<p class="muted">Could not load admin question list.</p>';
    return;
  }

  if (!data?.length) {
    host.innerHTML = '<p class="muted">No questions added this week.</p>';
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
      if (!confirm('Delete this question?')) return;

      const { error: deleteError } = await supabase
        .from('questions')
        .delete()
        .eq('id', button.dataset.delete);

      if (deleteError) {
        toast(deleteError.message);
        return;
      }

      toast('Question deleted');
      await loadQuestions();
      await loadAdminQuestions();
    });
  });
}

// ---------------- START APP ----------------

async function startApp() {
  setMode('login');

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    say('auth-message', error.message, true);
    return;
  }

  user = data.session?.user || null;

  if (user) {
    await loadSession();
  } else {
    renderSignedOut();
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null;
    setTimeout(() => loadSession(), 0);
  });
}

startApp();
