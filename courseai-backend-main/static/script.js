const authView = document.querySelector("#authView");
const appView = document.querySelector("#appView");
const authForm = document.querySelector("#authForm");
const authActions = document.querySelector("#authActions");
let authMode = "login";

function getToken() {
  return localStorage.getItem("courseai_token");
}

function headers(json = false) {
  const value = { Authorization: `Bearer ${getToken()}` };
  if (json) value["Content-Type"] = "application/json";
  return value;
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function showApp() {
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  authActions.innerHTML = '<button id="logoutButton" class="secondary">Logout</button>';
  document.querySelector("#logoutButton").addEventListener("click", logout);
  switchView("recommend");
}

function showAuth() {
  authView.classList.remove("hidden");
  appView.classList.add("hidden");
  authActions.innerHTML = "";
}

function logout() {
  localStorage.removeItem("courseai_token");
  localStorage.removeItem("courseai_user");
  showAuth();
}

document.querySelectorAll("[data-auth]").forEach((button) => {
  button.addEventListener("click", () => {
    authMode = button.dataset.auth;
    document.querySelectorAll("[data-auth]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector("#nameField").classList.toggle("hidden", authMode !== "signup");
    document.querySelector("#authSubmit").textContent = authMode === "signup" ? "Sign up" : "Login";
  });
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#authMessage");
  message.textContent = "";

  const payload = {
    email: document.querySelector("#email").value.trim(),
    password: document.querySelector("#password").value,
  };

  if (authMode === "signup") {
    payload.fullName = document.querySelector("#fullName").value.trim();
  }

  try {
    const data = await api(authMode === "signup" ? "/signup" : "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (authMode === "signup") {
      message.textContent = "Account created. Please log in.";
      document.querySelector('[data-auth="login"]').click();
      return;
    }

    localStorage.setItem("courseai_token", data.token);
    localStorage.setItem("courseai_user", JSON.stringify(data.user));
    showApp();
  } catch (error) {
    message.textContent = error.message;
  }
});

function courseName(course) {
  return course.course_name || course.course_title || "Course";
}

function courseCard(course, withActions = true) {
  const card = document.createElement("article");
  card.className = "course-card";
  card.innerHTML = `
    <h3></h3>
    <p class="provider"></p>
    <p class="description"></p>
    ${withActions ? '<button class="secondary bookmark-button">Bookmark</button>' : ""}
  `;
  card.querySelector("h3").textContent = courseName(course);
  card.querySelector(".provider").textContent =
    `${course.organization || course.partner || ""} ${course.difficulty_level || ""}`.trim();
  card.querySelector(".description").textContent =
    (course.course_description || course.reason || "").slice(0, 220);

  if (withActions) {
    card.querySelector(".bookmark-button").addEventListener("click", async () => {
      try {
        await api("/bookmark", {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify({
            course_name: courseName(course),
            difficulty_level: course.difficulty_level || "",
            organization: course.organization || course.partner || "",
          }),
        });
      } catch (error) {
        alert(error.message);
      }
    });

    card.addEventListener("click", async (event) => {
      if (event.target.classList.contains("bookmark-button")) return;
      try {
        await api("/recent", {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify({ course_name: courseName(course) }),
        });
      } catch (_) {}
    });
  }

  return card;
}

document.querySelector("#recommendForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = document.querySelector("#recommendMessage");
  message.textContent = "Finding courses...";
  document.querySelector("#courseGrid").innerHTML = "";

  try {
    const data = await api("/recommend", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });

    message.textContent = data.courses.length
      ? `${data.courses.length} courses found`
      : "No courses matched those filters.";

    const roadmap = document.querySelector("#roadmap");
    roadmap.innerHTML = "";
    if (data.roadmap && data.roadmap.length) {
      const heading = document.createElement("h2");
      heading.textContent = "Learning roadmap";
      roadmap.appendChild(heading);
      const list = document.createElement("ol");
      data.roadmap.forEach((step) => {
        const item = document.createElement("li");
        item.textContent = step;
        list.appendChild(item);
      });
      roadmap.appendChild(list);
    }

    data.courses.forEach((course) => {
      document.querySelector("#courseGrid").appendChild(courseCard(course));
    });
  } catch (error) {
    message.textContent = error.message;
  }
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

async function switchView(name) {
  document.querySelectorAll(".nav").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === name);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.add("hidden"));
  document.querySelector(`#${name}View`).classList.remove("hidden");

  if (name === "bookmarks") await loadCourses("/get-bookmarks", "#bookmarksGrid");
  if (name === "recent") await loadCourses("/get-recent", "#recentGrid");
  if (name === "analytics") await loadAnalytics();
}

async function loadCourses(path, gridSelector) {
  const grid = document.querySelector(gridSelector);
  grid.innerHTML = "<p>Loading...</p>";
  try {
    const courses = await api(path, { headers: headers() });
    grid.innerHTML = "";
    if (!courses.length) grid.innerHTML = "<p>No courses found.</p>";
    courses.forEach((course) => grid.appendChild(courseCard(course, false)));
  } catch (error) {
    grid.innerHTML = `<p>${error.message}</p>`;
  }
}

async function loadAnalytics() {
  const grid = document.querySelector("#analyticsGrid");
  grid.innerHTML = "<p>Loading...</p>";
  try {
    const data = await api("/analytics", { headers: headers() });
    grid.innerHTML = "";
    const cards = [
      ["Total bookmarks", data.total_bookmarks],
      ["Dataset courses", data.total_courses],
      ["Top course", data.top_courses?.[0]?._id || "-"],
    ];
    cards.forEach(([label, value]) => {
      const card = document.createElement("article");
      card.className = "stat-card";
      card.innerHTML = "<strong></strong><span></span>";
      card.querySelector("strong").textContent = value;
      card.querySelector("span").textContent = label;
      grid.appendChild(card);
    });
  } catch (error) {
    grid.innerHTML = `<p>${error.message}</p>`;
  }
}

document.querySelector("#homeButton").addEventListener("click", () => {
  if (getToken()) switchView("recommend");
});

if (getToken()) showApp();
