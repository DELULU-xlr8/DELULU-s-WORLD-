
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://imhxiljqhnenhkgbedxj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sDCXNbfAhU4MFaZc18YTIA_f3glPpf-";
const SITE_URL = "https://tihucollegequiz.netlify.app/";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentRole = "user";
let currentQuestions = [];
let authMode = "login";
let busy = false;

const $ = (id) => document.getElementById(id);

function show(id, visible) {
  const element = $(id);
  if (element) element.classList.toggle("hidden", !visible);
}

function message(id, text, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = text;
  element.style.color = isError ? "#fda4af" : "#86efac";
}

function setButton(id, text, disabled = false) {
  const button = $(id);
  if (!button) return;

  button.textContent = text;
  button.disabled = disabled;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderSignedOut() {
  currentUser = null;
  currentRole = "user";

  show("auth-panel", true);
  show("app-panel", false);
  show("admin-panel", false);
  show("logout-btn", false);

  message("quiz-message", "");
  message("leaderboard-message", "");
}

function renderSignedIn(user) {
  currentUser = user;

  show("auth-panel", false);
  show("app-panel", true);
  show("logout-btn", true);

  if ($("user-label")) {
    $("user-label").textContent =
      user.user_metadata?.full_name || user.email || "Student";
  }
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "login";

  const signup = authMode === "signup";

  if ($("login-tab")) {
    $("login-tab").classList.toggle("btn-primary", !signup);
    $("login-tab").classList.toggle("btn-secondary", signup);
    $("login-tab").setAttribute("aria-pressed", String(!signup));
  }

  if ($("signup-tab")) {
    $("signup-tab").classList.toggle("btn-primary", signup);
    $("signup-tab").classList.toggle("btn-secondary", !signup);
    $("signup-tab").setAttribute("aria-pressed", String(signup));
  }

  show("name-field", signup);

  if ($("auth-name")) {
    $("auth-name").required = signup;
  }

  if ($("auth-password")) {
    $("auth-password").autocomplete =
      signup ? "new-password" : "current-password";
  }

  setButton("auth-submit", signup ? "Create account →" : "Log in →");
  message("auth-message", "");
}

async function loadRole() {
  currentRole = "user";

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.warn("Profile role could not be loaded:", error.message);
    show("admin-panel", false);
    return;
  }

  currentRole = data?.role || "user";
  show("admin-panel", currentRole === "admin");
}

function getOptionList(options) {
  if (Array.isArray(options)) return options;

  if (typeof options === "string") {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Show a useful message if options are stored in another format.
    }
  }

  if (options && typeof options === "object") {
    return Object.entries(options).map(([key, value]) => ({
      key,
      text: value
    }));
  }

  return [];
}

async function loadQuestions() {
  const container = $("quiz-questions");
  if (!container) return;

  container.replaceChildren();
  currentQuestions = [];

  message("quiz-message", "");
  if ($("quiz-status")) {
    $("quiz-status").textContent = "Loading this week's questions…";
  }

  const { data, error } = await supabase
    .from("public_questions")
    .select("id,question_text,options,points,week_start")
    .order("week_start", { ascending: false })
    .limit(50);

  if (error) {
    if ($("quiz-status")) {
      $("quiz-status").textContent = "Questions could not be loaded.";
    }

    message(
      "quiz-message",
      "Question loading error: " + error.message,
      true
    );
    return;
  }

  if (!data?.length) {
    if ($("quiz-status")) {
      $("quiz-status").textContent =
        "No published questions were found. Please check back later.";
    }
    return;
  }

  currentQuestions = data;

  data.forEach((question, index) => {
    const card = document.createElement("article");
    card.className = "question-card";

    const heading = document.createElement("h3");
    heading.textContent =
      `${index + 1}. ${question.question_text || "Question"}`;

    const points = document.createElement("p");
    points.className = "muted";
    points.textContent = `${Number(question.points) || 0} points`;

    card.append(heading, points);

    const options = getOptionList(question.options);

    if (!options.length) {
      const warning = document.createElement("p");
      warning.className = "muted";
      warning.textContent = "Options are not configured for this question.";
      card.append(warning);
    } else {
      options.forEach((option, optionIndex) => {
        const value =
          typeof option === "object"
            ? String(option.key ?? option.value ?? optionIndex)
            : String(optionIndex);

        const labelText =
          typeof option === "object"
            ? String(option.text ?? option.label ?? option.value ?? "")
            : String(option);

        const label = document.createElement("label");
        const radio = document.createElement("input");

        radio.type = "radio";
        radio.name = `question-${question.id}`;
        radio.value = value;
        radio.required = optionIndex === 0;

        const text = document.createElement("span");
        text.textContent = labelText;

        label.append(radio, text);
        card.append(label);
      });
    }

    container.append(card);
  });

  if ($("quiz-status")) {
    $("quiz-status").textContent =
      `${data.length} question(s) loaded. Select your answers below.`;
  }
}

async function loadLeaderboard() {
  const body = $("leaderboard-body");
  if (!body) return;

  body.replaceChildren();

  const { data, error } = await supabase.rpc("weekly_leaderboard");

  if (error) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "Leaderboard unavailable: " + error.message;
    row.append(cell);
    body.append(row);
    message("leaderboard-message", error.message, true);
    return;
  }

  if (!data?.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "No scores recorded for this week yet.";
    row.append(cell);
    body.append(row);
    return;
  }

  data.forEach((item, index) => {
    const row = document.createElement("tr");

    const rank = document.createElement("td");
    rank.textContent = String(index + 1);

    const student = document.createElement("td");
    student.textContent =
      item.full_name || item.name || item.email || "Student";

    const points = document.createElement("td");
    points.textContent = String(item.points ?? item.score ?? 0);

    row.append(rank, student, points);
    body.append(row);
  });
}

async function loadArchive() {
  const container = $("archive-list");
  if (!container) return;

  container.replaceChildren();

  const { data, error } = await supabase
    .from("weekly_winners")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(20);

  if (error) {
    const item = document.createElement("p");
    item.className = "muted";
    item.textContent = "Past winners unavailable: " + error.message;
    container.append(item);
    return;
  }

  if (!data?.length) {
    const item = document.createElement("p");
    item.className = "muted";
    item.textContent = "Past weekly winners will appear here.";
    container.append(item);
    return;
  }

  data.forEach((winner) => {
    const item = document.createElement("article");
    item.className = "archive-item";

    const title = document.createElement("strong");
    title.textContent =
      winner.full_name ||
      winner.name ||
      winner.winner_name ||
      "Weekly winner";

    const details = document.createElement("p");
    details.className = "muted";
    details.textContent = [
      winner.week_start ? `Week: ${winner.week_start}` : "",
      winner.points != null ? `Points: ${winner.points}` : ""
    ].filter(Boolean).join(" • ");

    item.append(title, details);
    container.append(item);
  });
}

async function loadAdminQuestions() {
  const container = $("admin-question-list");
  if (!container || currentRole !== "admin") return;

  container.replaceChildren();

  const { data, error } = await supabase
    .from("questions")
    .select("id,question_text,options,points,week_start")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    const item = document.createElement("p");
    item.textContent = "Admin question loading error: " + error.message;
    item.className = "muted";
    container.append(item);
    return;
  }

  if (!data?.length) {
    const item = document.createElement("p");
    item.textContent = "No questions found in the admin table.";
    item.className = "muted";
    container.append(item);
    return;
  }

  data.forEach((question) => {
    const item = document.createElement("article");
    item.className = "admin-question-item";

    const title = document.createElement("strong");
    title.textContent = question.question_text || "Untitled question";

    const details = document.createElement("p");
    details.className = "muted";
    details.textContent =
      `${Number(question.points) || 0} points · ID: ${question.id}`;

    item.append(title, details);
    container.append(item);
  });
}

async function loadDashboard() {
  await loadRole();

  await Promise.allSettled([
    loadQuestions(),
    loadLeaderboard(),
    loadArchive()
  ]);

  if (currentRole === "admin") {
    await loadAdminQuestions();
  }
}

async function loadSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    renderSignedOut();
    message("auth-message", "Session error: " + error.message, true);
    return;
  }

  const user = data.session?.user || null;

  if (!user) {
    renderSignedOut();
    return;
  }

  renderSignedIn(user);
  await loadDashboard();
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  if (busy) return;
  busy = true;

  const email = $("auth-email")?.value.trim();
  const password = $("auth-password")?.value;
  const fullName = $("auth-name")?.value.trim();

  setButton("auth-submit", "Please wait…", true);
  message("auth-message", "");

  try {
    let result;

    if (authMode === "signup") {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: SITE_URL,
          data: {
            full_name: fullName || ""
          }
        }
      });

      if (result.error) throw result.error;

      if (result.data.session) {
        renderSignedIn(result.data.user);
        message("auth-message", "Account created successfully.");
        await loadDashboard();
      } else {
        message(
          "auth-message",
          "Account created. Check your email to confirm it, then log in."
        );
      }
    } else {
      result = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (result.error) throw result.error;

      renderSignedIn(result.data.user);
      message("auth-message", "Welcome back!");
      await loadDashboard();
    }
  } catch (error) {
    console.error("Authentication error:", error);
    message(
      "auth-message",
      error?.message || "Unable to complete authentication.",
      true
    );
  } finally {
    busy = false;
    setButton(
      "auth-submit",
      authMode === "signup" ? "Create account →" : "Log in →",
      false
    );
  }
}

async function handleLogout() {
  const button = $("logout-btn");
  if (button) button.disabled = true;

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    renderSignedOut();
    setAuthMode("login");
    message("auth-message", "You have logged out.");
  } catch (error) {
    message("auth-message", error.message || "Logout failed.", true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleQuizSubmit(event) {
  event.preventDefault();

  if (!currentUser) {
    message("quiz-message", "Please log in first.", true);
    return;
  }

  if (!currentQuestions.length) {
    message("quiz-message", "There are no questions to submit.", true);
    return;
  }

  const answers = [];

  for (const question of currentQuestions) {
    const selected = document.querySelector(
      `input[name="question-${CSS.escape(String(question.id))}"]:checked`
    );

    if (!selected) {
      message("quiz-message", "Please answer every question first.", true);
      return;
    }

    answers.push({
      question_id: question.id,
      selected_option: selected.value
    });
  }

  const button = $("submit-quiz-btn");
  if (button) button.disabled = true;

  try {
    const { data, error } = await supabase.rpc("submit_quiz", {
      answers
    });

    if (error) {
      message(
        "quiz-message",
        "Submission failed: " + error.message +
        ". The submit_quiz database function may need different arguments.",
        true
      );
      return;
    }

    message(
      "quiz-message",
      data?.message || "Answers submitted successfully."
    );

    await loadLeaderboard();
  } catch (error) {
    message("quiz-message", error.message || "Submission failed.", true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleAdminQuestionSubmit(event) {
  event.preventDefault();

  if (currentRole !== "admin") {
    message("admin-message", "Admin access is required.", true);
    return;
  }

  const questionText = $("question-text")?.value.trim();
  const points = Number($("question-points")?.value || 10);
  const correctOption = $("correct-option")?.value;

  const options = [
    { key: "A", text: $("option-a")?.value.trim() },
    { key: "B", text: $("option-b")?.value.trim() },
    { key: "C", text: $("option-c")?.value.trim() },
    { key: "D", text: $("option-d")?.value.trim() }
  ];

  const today = new Date();
  const day = today.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  today.setUTCDate(today.getUTCDate() - mondayOffset);
  const weekStart = today.toISOString().slice(0, 10);

  message("admin-message", "Saving question…");

  const { error } = await supabase.from("questions").insert({
    question_text: questionText,
    options,
    correct_option: correctOption,
    points,
    week_start: weekStart,
    created_by: currentUser.id
  });

  if (error) {
    message(
      "admin-message",
      "Could not save question: " + error.message +
      ". Check the questions table columns and RLS policies.",
      true
    );
    return;
  }

  message("admin-message", "Question added successfully.");
  $("admin-question-form")?.reset();
  await loadAdminQuestions();
}

function initialise() {
  $("login-tab")?.addEventListener("click", () => setAuthMode("login"));
  $("signup-tab")?.addEventListener("click", () => setAuthMode("signup"));
  $("auth-form")?.addEventListener("submit", handleAuthSubmit);
  $("logout-btn")?.addEventListener("click", handleLogout);
  $("quiz-form")?.addEventListener("submit", handleQuizSubmit);
  $("admin-question-form")?.addEventListener(
    "submit",
    handleAdminQuestionSubmit
  );

  setAuthMode("login");

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      renderSignedOut();
      return;
    }

    if (session?.user) {
      renderSignedIn(session.user);
      // Avoid running Supabase requests inside the auth callback.
      queueMicrotask(() => loadDashboard());
    }
  });

  loadSession().catch((error) => {
    console.error("Startup error:", error);
    renderSignedOut();
    message("auth-message", "Startup error: " + error.message, true);
  });
}

initialise();
