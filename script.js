const CLIENT_ID = "50125941263-iva3amlqcbc6vovosn8dr00pdt6jfs8h.apps.googleusercontent.com";
const API_KEY = "AIzaSyDCmYzQ68Cz7f99JCplJEFc902maHZAQxs";

const DISCOVERY_DOC = "https://classroom.googleapis.com/$discovery/rest";

const SCOPES =
    "https://www.googleapis.com/auth/classroom.courses.readonly " +
    "https://www.googleapis.com/auth/classroom.profile.photos";

let tokenClient;
let gapiInited = false;
let gisInited = false;
const HAS_VISITED_KEY = "classroomLiteHasVisited";

document.getElementById("signout_button").style.visibility = "hidden";

function gapiLoaded() {
    gapi.load("client", initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    maybeEnableButtons();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '',
        error_callback: handleTokenError,
    });
    gisInited = true;
    maybeEnableButtons();
}

function handleTokenError(error) {
    console.error("Google authorization error:", error);

    showAuthorizationRequired(
        "No s’ha pogut iniciar sessió. Prem el botó per connectar amb Google."
    );
}

function maybeEnableButtons() {
    if (!gapiInited || !gisInited) {
        return;
    }

    const hasVisited = localStorage.getItem(HAS_VISITED_KEY) === "true";

    if (!hasVisited) {
        showAuthorizationRequired(
            "És la primera vegada que utilitzes Classroom Lite. Prem «Autoritzar» per continuar.",
        );

        return;
    }

    trySilentAuth();
}

function trySilentAuth() {
    document.getElementById("loading").style.display = "none";
    document.getElementById("course_grid").innerHTML = "";

    document.getElementById("content").innerHTML = `
        <div class="auth-panel">
            <div class="auth-loading">
                Connectant amb Google...
            </div>
        </div>
    `;

    let finished = false;

    const failSilentAuth = () => {
        if (finished) return;

        finished = true;

        showAuthorizationRequired(
            "No s’ha pogut iniciar sessió automàticament. Pot ser que els permisos hagin canviat. Prem el botó per tornar a connectar."
        );
    };

    // Si Google no respon en 5 segons, no deixem la pantalla penjada.
    const timeout = setTimeout(() => {
        failSilentAuth();
    }, 5000);

    tokenClient.callback = async (resp) => {
        if (finished) return;

        if (resp.error !== undefined) {
            clearTimeout(timeout);
            failSilentAuth();
            return;
        }

        // Comprovar que el token té TOTS els scopes necessaris.
        const hasAllScopes =
            google.accounts.oauth2.hasGrantedAllScopes(
                resp,
                ...SCOPES.split(" ")
            );

        if (!hasAllScopes) {
            clearTimeout(timeout);
            failSilentAuth();
            return;
        }

        finished = true;
        clearTimeout(timeout);

        document.getElementById("signout_button").style.visibility = "visible";

        await listCourses();
    };

    tokenClient.requestAccessToken({
        prompt: "none"
    });
}

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            console.error("Authorization failed:", resp);

            showAuthorizationRequired(
                "No s’ha pogut autoritzar l’accés a Classroom. Torna-ho a provar.",
            );

            return;
        }

        localStorage.setItem(HAS_VISITED_KEY, "true");

        document.body.classList.remove("auth-required");

        document.getElementById("signout_button").style.visibility = "visible";
        document.getElementById("authorize_button").innerText = "Refresh";

        await listCourses();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({
            prompt: "select_account",
        });
    } else {
        tokenClient.requestAccessToken({
            prompt: "",
        });
    }
}

function handleSignoutClick() {
    gapi.client.setToken(null);

    document.getElementById("course_grid").innerHTML = "";
    document.getElementById("loading").style.display = "none";

    document.getElementById("signout_button").style.visibility = "hidden";

    showAuthorizationRequired(
        "Has tancat la sessió de Classroom Lite. Prem el botó per tornar a entrar."
    );
}

async function listCourses() {
    document.body.classList.remove('auth-required');
    let courses = [];
    let pageToken = null;

    document.getElementById("loading").style.display = "flex";
    document.getElementById("course_grid").innerHTML = "";
    document.getElementById("content").innerText = "";

    try {
        do {
            const response = await gapi.client.classroom.courses.list({
                pageSize: 100,
                pageToken: pageToken,
                courseStates: ["ACTIVE"],
            });

            const currentCourses = response.result.courses || [];
            courses = courses.concat(currentCourses);

            pageToken = response.result.nextPageToken || null;
        } while (pageToken);
    } catch (err) {
    console.error("Classroom API error:", err);

    document.getElementById("loading").style.display = "none";

    const errorCode =
        err?.status ||
        err?.result?.error?.code ||
        err?.result?.error?.status;

    if (errorCode === 401 || errorCode === 403) {
        showAuthorizationRequired(
            "Necessitem tornar a autoritzar l'accés a Classroom perquè els permisos de l'aplicació han canviat."
        );
        return;
    }

    document.getElementById("content").innerText =
        err?.message || JSON.stringify(err);

    return;
}

    document.getElementById("loading").style.display = "none";

    if (courses.length === 0) {
        document.getElementById("content").innerText = "No active courses found.";
        return;
    }

    const grid = document.getElementById("course_grid");

    courses.forEach((course, index) => {
        const card = document.createElement("a");
        card.className = "course-card";

        const pattern = (index % 4) + 1;

        const params = new URLSearchParams();

        params.set("id", course.id);
        params.set("name", course.name || "Sense nom");

        if (course.section) {
            params.set("section", course.section);
        }

        params.set("pattern", pattern);

        card.href = `class.html?${params.toString()}`;

        card.innerHTML = `
    <div class="course-banner pattern-${pattern}">
        <div class="course-title-on-banner">
        <div class="course-title">
            ${escapeHtml(course.name || "Sense nom")}
        </div>

        ${course.section
                ? `<div class="course-section">${escapeHtml(course.section)}</div>`
                : ""
            }
        </div>
    </div>

    <div class="course-body"></div>
    `;

        grid.appendChild(card);
    });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function showAuthorizationRequired(message) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('course_grid').innerHTML = '';

  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="auth-panel">
      <div class="auth-message">
        <h2>Cal connectar amb Google</h2>
        <p>${escapeHtml(message)}</p>
      </div>

      <button
        id="authorize_button"
        class="google-login-button"
        type="button"
      >
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt=""
        >
        <span>Inicia la sessió amb Google</span>
      </button>
    </div>
  `;

  document.getElementById('authorize_button').onclick = handleAuthClick;

  document.getElementById('signout_button').style.visibility = 'hidden';

  // Ja no necessitem el botó que hi havia fora del panell.
  const oldAuthorizeButton = document.querySelector(
    'body > #authorize_button'
  );

  if (oldAuthorizeButton) {
    oldAuthorizeButton.style.visibility = 'hidden';
  }
}