
import { createClient } from '@supabase/supabase-js';

// Supabase public Project URL + publishable key
// Never put a service_role key in this file.
const SUPABASE_URL = 'https://imhxiljqhnenhkgbedxj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sDCXNbfAhU4MFaZc18YTIA_f3glPpf-';

const configured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('PASTE_') &&
  !SUPABASE_ANON_KEY.includes('PASTE_');

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

function show(el, yes = true) {
  const element = $(el);
  if (element) element.classList.toggle('hidden', !yes);
}

function escapeHtml(v = '') {
  return String(v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// Monday of the current week in India time
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

if ($('week-label')) {
  $('week-label').textContent = weekLabel();
}

// Login / signup mode
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

// Authentication
$('auth-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!supabase) {
    return say(
      'auth-message',
      'Setup needed: check your Supabase URL and public key in src.js.',
      true
    );
  }

  say('auth-message', 'Please wait…');

  const email = $('email').value.trim();
  const password = $('password').value;
  const name = $('full-name')?.value.trim() || '';

  let result;

  try {
    if (mode === 'signup') {
      if (!name) {
        return say('auth-message', 'Please enter your full name.', true);
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
      return say('auth-message', result.error.message, true);
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
    console.error('Authentication error:', error);
    say('auth-message', 'Authentication failed. Please try again.', true);
  }
});

// Logout
$('logout-btn')?.addEventListener('click', async () => {
  if (supabase) {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast(error.message);
      return;
    }
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

// Load session
async function loadSession() {
  if (!supabase) return;

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    user = data.session?.user || null;

    if (!user) {
      renderSignedOut();
      return;
    }

    show('auth-panel', false);
    show('app-panel', true);
    show('logout-btn', true);

    $('user-label').textContent =
      user.user_metadata?.full_name || user.email || 'Student';

    await loadRoleAndData();
  } catch (error) {
    console.error('Session error:', error);
    toast('Could not load your session. Please refresh.');
  }
}

// Load profile and app data
async function loadRoleAndData() {
  if (!supabase || !user) return;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name,role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Profile error:', error);
  }

  if (profile?.display_name) {
    $('user-label').textContent = profile.display_name;
  }

  const isAdmin = profile?.role === 'admin';
  show('admin-panel', isAdmin);

  await Promise.all([
    loadQuestions(),
    loadLeaderboard(),
    loadArchive()
  ]);

  if (isAdmin) {
    await loadAdminQuestions();
  }
}

// FIXED: Load questions from the public view.
// This assumes public_questions exposes only published questions.
async function loadQuestions() {
  const host = $('quiz-content');

  if (!supabase || !host) return;

  host.innerHTML = '<p class="muted">Loading questions…</p>';

  try {
    const { data, error } = await supabase
      .from('public_questions')
      .select('id,question_text,options,points,week_start,created_at')
      .eq('week_start', weekStartISO())
      .order('created_at');

    if (error) {
      console.error('Question loading error:', error);

      host.innerHTML =
        `<p class="muted">Could not load questions: ${escapeHtml(error.message)}</p>`;

      return;
    }

    questions = data || [];
    current = 0;
    selected = {};
    submitted = false;

    renderQuestion();
  } catch (error) {
    console.error('Unexpected question loading error:', error);

    host.innerHTML =
      '<p class="muted">Unexpected error while loading questions. Please refresh.</p>';
  }
}

// Render quiz question
function renderQuestion() {
  const host = $('quiz-content');
  if (!host) return;

  if (!questions.length) {
    host.innerHTML = `
      <div class="empty">
        <div class="empty-icon">◎</div>
        <h3>Questions are on the way</h3>
        <p>The quiz administrator hasn’t published this week’s questions yet.</p>
      </div>
    `;
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
      </div>
    `;

    $('refresh-board').onclick = loadLeaderboard;
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
          <button
            class="answer ${selected[q.id] === i ? 'selected' : ''}"
            data-index="${i}"
            type="button"
          >
            <span class="letter">${letters[i]}</span>
            <span>${escapeHtml(opt)}</span>
          </button>
        `).join('')}
      </div>

      <div class="quiz-controls">
        <span class="quiz-progress">
          ${Object.keys(selected).length} answered
        </span>

        <button id="next-question" class="btn btn-primary" type="button">
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

  $('next-question').onclick = async () => {
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
  };
}

// Submit quiz
async function submitQuiz() {
  const btn = $('next-question');
  if (btn) btn.disabled = true;

  const answers = questions.map((q) => ({
    question_id: q.id,
    selected_option: selected[q.id]
  }));

  try {
    const { data, error } = await supabase.rpc('submit_quiz', {
      p_week_start: weekStartISO(),
      p_answers: answers
    });

    if (error) {
      console.error('Quiz submission error:', error);
      toast('Could not submit: ' + error.message);
      if (btn) btn.disabled = false;
      return;
    }

    submitted = true;
    renderQuestion();

    toast(`Quiz submitted · ${data?.points_earned ?? 0} points earned`);

    await loadLeaderboard();
  } catch (error) {
    console.error('Unexpected submission error:', error);
    toast('Could not submit quiz. Please try again.');
    if (btn) btn.disabled = false;
  }
}

// Leaderboard
async function loadLeaderboard() {
  const host = $('leaderboard');

  if (!supabase || !host) return;

  try {
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

    host.innerHTML = data.slice(0, 10).map((r, i) => `
      <div class="leader-row">
        <span class="rank ${i < 3 ? 'top' : ''}">
          ${String(i + 1).padStart(2, '0')}
        </span>

        <div>
          <div class="player-name">
            ${escapeHtml(r.display_name || 'Student')}
          </div>
          <div class="player-sub">
            ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}
          </div>
        </div>

        <span class="score">${r.total_points} pts</span>
      </div>
    `).join('');
  } catch (error) {
    console.error('Unexpected leaderboard error:', error);
    host.innerHTML =
      '<p class="muted">Could not load leaderboard.</p>';
  }
}

// Archived winners
async function loadArchive() {
  const host = $('archive');

  if (!supabase || !host) return;

  try {
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

    host.innerHTML = data.map((r) => `
      <div class="archive-item">
        <span>
          <span class="muted">${escapeHtml(r.week_start)}</span><br>
          <strong>${escapeHtml(r.winner_name)}</strong>
        </span>
        <b>${r.winner_points} pts</b>
      </div>
    `).join('');
  } catch (error) {
    console.error('Archive error:', error);
    host.innerHTML =
      '<p class="muted">Could not load archived winners.</p>';
  }
}

// Add a question from admin panel
$('question-form')?.addEventListener('submit', async (e) => {
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

  try {
    const { error } = await supabase
      .from('questions')
      .insert(payload);

    if (error) {
      console.error('Add question error:', error);
      say('admin-message', error.message, true);
      return;
    }

    e.target.reset();
    $('points').value = 1;

    say('admin-message', 'Question added and published.');

    await loadQuestions();
    await loadAdminQuestions();
  } catch (error) {
    console.error('Unexpected add-question error:', error);
    say('admin-message', 'Could not add question. Please try again.', true);
  }
});

// Admin question list
async function loadAdminQuestions() {
  const host = $('admin-question-list');

  if (!supabase || !host) return;

  try {
    const { data, error } = await supabase
      .from('questions')
      .select('id,question_text,is_published')
      .eq('week_start', weekStartISO())
      .order('created_at');

    if (error) {
      console.error('Admin question list error:', error);
      host.innerHTML =
        '<p class="muted">Could not load admin question list.</p>';
      return;
    }

    host.innerHTML = (data || []).map((q) => `
      <div class="admin-question">
        <span>
          ${escapeHtml(q.question_text)}
          <span class="muted">
            · ${q.is_published ? 'Published' : 'Draft'}
          </span>
        </span>
        <button data-delete="${q.id}" type="button">Delete</button>
      </div>
    `).join('');

    host.querySelectorAll('[data-delete]').forEach((button) => {
      button.onclick = async () => {
        if (!confirm('Delete this question?')) return;

        const { error } = await supabase
          .from('questions')
          .delete()
          .eq('id', button.dataset.delete);

        if (error) {
          toast(error.message);
        } else {
          toast('Question deleted');
          await loadQuestions();
          await loadAdminQuestions();
        }
      };
    });
  } catch (error) {
    console.error('Unexpected admin list error:', error);
    host.innerHTML =
      '<p class="muted">Could not load admin question list.</p>';
  }
}

// Initial setup
if (!configured) {
  show('auth-panel', true);
  say(
    'auth-message',
    'Setup required: check your Supabase Project URL and public key in src.js.',
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
