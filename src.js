
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://imhxiljqhnenhkgbedxj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sDCXNbfAhU4MFaZc18YTIA_f3glPpf-';

const configured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_ANON_KEY.includes('PASTE_');

const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

const $ = id => document.getElementById(id);

let mode = 'login';
let user = null;
let sessionLoading = false;

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
  if (!el) {
    console.log(message);
    return;
  }

  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function renderSignedOut() {
  show('auth-panel', true);
  show('app-panel', false);
  show('logout-btn', false);

  if ($('user-label')) $('user-label').textContent = '';
}

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

$('auth-form')?.addEventListener('submit', async event => {
  event.preventDefault();

  if (!supabase) {
    say(
      'auth-message',
      'Supabase public key missing. Add your existing public key in src.js.',
      true
    );
    return;
  }

  const button = $('auth-submit');
  if (button) button.disabled = true;

  say('auth-message', 'Please wait…');

  try {
    const email = $('email').value.trim();
    const password = $('password').value;
    const name = $('full-name')?.value.trim() || '';

    if (!email || !password) {
      say('auth-message', 'Enter your email and password.', true);
      return;
    }

    let result;

    if (mode === 'signup') {
      if (!name) {
        say('auth-message', 'Enter your full name.', true);
        return;
      }

      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: 'https://tihucollegequiz.netlify.app/'
        }
      });

      if (result.error) throw result.error;

      if (!result.data.session) {
        say(
          'auth-message',
          'Account created. Confirm your email, then log in.'
        );
        return;
      }
    } else {
      result = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (result.error) throw result.error;
    }

    if (!result.data.session) {
      say(
        'auth-message',
        'Login session was not created. Check your Supabase settings.',
        true
      );
      return;
    }

    user = result.data.session.user;

    say('auth-message', '');
    toast('Login successful');

    await renderSignedIn(user);
  } catch (error) {
    console.error('Authentication error:', error);
    say(
      'auth-message',
      error.message || 'Login failed. Please try again.',
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
});

async function renderSignedIn(currentUser) {
  if (!currentUser) {
    renderSignedOut();
    return;
  }

  user = currentUser;

  show('auth-panel', false);
  show('app-panel', true);
  show('logout-btn', true);

  if ($('user-label')) {
    $('user-label').textContent =
      user.user_metadata?.full_name || user.email || 'Student';
  }

  try {
    await loadRoleAndData();
  } catch (error) {
    console.error('Dashboard loading error:', error);
    toast('Logged in, but some dashboard data failed to load.');
  }
}

async function loadSession() {
  if (!supabase || sessionLoading) return;

  sessionLoading = true;

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    if (!data.session?.user) {
      user = null;
      renderSignedOut();
      return;
    }

    await renderSignedIn(data.session.user);
  } catch (error) {
    console.error('Session error:', error);
    say('auth-message', error.message || 'Could not restore login.', true);
    renderSignedOut();
  } finally {
    sessionLoading = false;
  }
}

$('logout-btn')?.addEventListener('click', async () => {
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();

  if (error) {
    toast(error.message);
    return;
  }

  user = null;
  renderSignedOut();
  toast('Logged out');
});

if (!configured) {
  renderSignedOut();
  say(
    'auth-message',
    'Add your existing Supabase public key in src.js before logging in.',
    true
  );
} else {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      user = null;
      renderSignedOut();
    }

    // SIGNED_IN is handled by the login form.
    // INITIAL_SESSION is handled by loadSession().
  });

  loadSession();
}
