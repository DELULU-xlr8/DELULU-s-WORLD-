
async function loadSession() {
  const authPanel = document.getElementById('auth-panel');
  const appPanel = document.getElementById('app-panel');

  function diagnostic(message) {
    let box = document.getElementById('login-debug');

    if (!box) {
      box = document.createElement('div');
      box.id = 'login-debug';
      box.style.cssText =
        'position:fixed;bottom:12px;left:12px;right:12px;' +
        'z-index:99999;background:#170d2b;color:#fff;' +
        'padding:14px;border:1px solid #a78bfa;border-radius:12px;' +
        'font:14px sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;';
      document.body.appendChild(box);
    }

    box.textContent = 'LOGIN DEBUG\n' + message;
  }

  try {
    diagnostic('Checking Supabase session…');

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      diagnostic('Session error: ' + error.message);
      renderSignedOut();
      return;
    }

    user = data.session?.user || null;

    if (!user) {
      renderSignedOut();
      diagnostic(
        'No active session found.\n' +
        'Auth panel: ' + (authPanel?.className || 'not found') + '\n' +
        'App panel: ' + (appPanel?.className || 'not found')
      );
      return;
    }

    show('auth-panel', false);
    show('app-panel', true);
    show('logout-btn', true);
    show('admin-panel', false);

    diagnostic(
      'Session found for: ' + (user.email || user.id) + '\n' +
      'Auth panel classes: ' + (authPanel?.className || 'not found') + '\n' +
      'App panel classes: ' + (appPanel?.className || 'not found')
    );

    if ($('user-label')) {
      $('user-label').textContent =
        user.user_metadata?.full_name || user.email || 'Student';
    }

    await loadRoleAndData();

    diagnostic(
      'Session exists and dashboard was enabled.\n' +
      'Auth panel classes: ' + (authPanel?.className || 'not found') + '\n' +
      'App panel classes: ' + (appPanel?.className || 'not found') + '\n' +
      'If login panel is still visible, check CSS or duplicate scripts.'
    );
  } catch (error) {
    diagnostic('Unexpected error: ' + (error?.message || String(error)));
    console.error('loadSession error:', error);
  }
}
