"use strict";

const API = "/.netlify/functions/tmdb";
const IMAGE = "https://image.tmdb.org/t/p/w500";

let heroMovie = null;
let heroTrailerKey = null;
let toastTimeout;

async function fetchMovies(path, params = {}) {
    const query = new URLSearchParams({
        path,
        ...params
    });

    let response = await fetch(`${API}?${query}`);
    if (response.status >= 500) {
        await new Promise(resolve => setTimeout(resolve, 500));
        response = await fetch(`${API}?${query}`);
    }

    if (!response.ok) {
        throw new Error(`Movie API request failed (status ${response.status})`);
    }

    return response.json();
}

async function fetchMoviePages(path, params = {}, pageCount = 2) {
    const pageResults = await Promise.all(
        Array.from({ length: pageCount }, (_, index) =>
            fetchMovies(path, { ...params, page: index + 1 })
        )
    );

    const moviesById = new Map();
    pageResults.forEach(data => {
        if (!Array.isArray(data.results)) return;
        data.results.forEach(movie => {
            if (movie.id && !moviesById.has(movie.id)) {
                moviesById.set(movie.id, movie);
            }
        });
    });

    return Array.from(moviesById.values());
}

const categories = [
    { title: "Trending Movies", path: "/movie/popular" },
    { title: "Top Rated Movies", path: "/movie/top_rated" },
    {
        title: "Free to Watch (India)",
        path: "/discover/movie",
        params: {
            watch_region: "IN",
            with_watch_monetization_types: "free|ads",
            sort_by: "popularity.desc"
        }
    },
    { title: "Science Fiction", path: "/discover/movie", params: { with_genres: 878 } },
    { title: "Drama", path: "/discover/movie", params: { with_genres: 18 } },
    { title: "Horror", path: "/discover/movie", params: { with_genres: 27 } },
    { title: "Comedy", path: "/discover/movie", params: { with_genres: 35 } },
    { title: "Action", path: "/discover/movie", params: { with_genres: 28 } },
    { title: "Animation", path: "/discover/movie", params: { with_genres: 16 } },
    { title: "Thriller", path: "/discover/movie", params: { with_genres: 53 } },
    { title: "Adventure", path: "/discover/movie", params: { with_genres: 12 } },
    { title: "Food Movies", path: "/search/movie", params: { query: "food" } }
];

async function loadMovies() {
    const container = document.getElementById("movieSections");
    if (!container) return;

    container.replaceChildren();

    const categoryResults = await Promise.all(categories.map(async category => {
        const section = document.createElement("section");
        section.className = "movie-section";

        const heading = document.createElement("h2");
        heading.textContent = category.title;

        const row = document.createElement("div");
        row.className = "movie-row";
        const loadingMessage = document.createElement("p");
        loadingMessage.textContent = "Loading movies...";
        row.appendChild(loadingMessage);
        section.append(heading, row);
        container.appendChild(section);

        try {
            const movies = await fetchMoviePages(category.path, category.params || {});
            row.replaceChildren();
            let displayedMovies = 0;

            movies.forEach(movie => {
                if (!movie.poster_path) return;
                displayedMovies++;

                const titleText = movie.title || "Untitled movie";
                const card = document.createElement("article");
                card.className = "movie-card";
                card.tabIndex = 0;
                card.setAttribute("role", "button");
                card.setAttribute("aria-label", `Play trailer for ${titleText}`);

                const image = document.createElement("img");
                image.src = IMAGE + movie.poster_path;
                image.alt = `${titleText} poster`;
                image.loading = "lazy";

                const title = document.createElement("h3");
                title.textContent = titleText;

                const rating = document.createElement("p");
                const voteAverage = Number(movie.vote_average);
                rating.textContent = `Rating: ${Number.isFinite(voteAverage) ? voteAverage.toFixed(1) : "N/A"}/10`;

                card.append(image, title, rating);
                card.addEventListener("mouseenter", () => loadPreview(card, movie.id));
                card.addEventListener("mouseleave", () => {
                    clearTimeout(card.previewTimer);
                    const preview = card.querySelector("iframe");
                    if (preview) preview.remove();
                });
                card.addEventListener("click", () => openTrailer(movie.id));
                card.addEventListener("keydown", event => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openTrailer(movie.id);
                    }
                });

                row.appendChild(card);
            });
            if (movies.length === 0) {
                const emptyMessage = document.createElement("p");
                emptyMessage.textContent = "No movies found in this category.";
                row.appendChild(emptyMessage);
            }
            return { loaded: true, displayedMovies, movies };
        } catch (error) {
            console.error(`Unable to load ${category.title}.`, error);
            row.replaceChildren();
            const errorMessage = document.createElement("p");
            errorMessage.textContent = "This category could not be loaded.";
            row.appendChild(errorMessage);
            return { loaded: false, displayedMovies: 0, movies: [] };
        }
    }));

    const displayedMovies = categoryResults.reduce(
        (total, result) => total + result.displayedMovies,
        0
    );
    const loadedCategories = categoryResults.filter(result => result.loaded).length;
    const featuredMovie = categoryResults
        .map(result => result.movies[0])
        .find(movie => movie);
    if (featuredMovie) {
        setupHero(featuredMovie);
    }

    const status = document.getElementById("tmdbStatus");
    const movieCount = document.getElementById("movieCount");
    const emptyState = document.getElementById("emptyState");
    if (status) {
        status.textContent = loadedCategories > 0
            ? `${loadedCategories} of ${categories.length} categories loaded.`
            : "Movies could not be loaded. Check your API configuration.";
    }
    if (movieCount) movieCount.textContent = `${displayedMovies} movies`;
    if (emptyState) emptyState.hidden = displayedMovies > 0;
}

async function setupHero(movie) {
    heroMovie = movie;
    heroTrailerKey = null;

    const title = document.getElementById("heroTitle");
    const description = document.getElementById("heroDescription");
    const hero = document.getElementById("hero");

    if (title) title.textContent = movie.title || "Featured movie";
    if (description) description.textContent = movie.overview || "Discover this movie.";

    if (hero && movie.backdrop_path) {
        const backdrop = IMAGE.replace("w500", "original") + encodeURI(movie.backdrop_path);
        hero.style.backgroundImage = [
            "linear-gradient(to right, #111 10%, transparent)",
            "linear-gradient(to top, #111, transparent)",
            `url("${backdrop}")`
        ].join(", ");
    }

    try {
        const data = await fetchMovies(`/movie/${movie.id}/videos`);
        const videos = Array.isArray(data.results) ? data.results : [];
        const trailer = videos.find(video =>
            video.site === "YouTube" && video.type === "Trailer" && video.key
        );
        heroTrailerKey = trailer ? trailer.key : null;
    } catch (error) {
        console.error(error);
    }
}

async function openTrailer(movieId, cachedKey = null) {
    try {
        let trailerKey = cachedKey;

        if (!trailerKey) {
            const data = await fetchMovies(`/movie/${movieId}/videos`);
            const videos = Array.isArray(data.results) ? data.results : [];
            const trailer = videos.find(video =>
                video.site === "YouTube" && video.type === "Trailer" && video.key
            );
            trailerKey = trailer ? trailer.key : null;
        }

        if (!trailerKey) {
            showToast("Trailer not available.");
            return;
        }

        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerKey)}?autoplay=1&mute=1`;
        iframe.title = "Movie trailer";
        iframe.allow = "autoplay; encrypted-media; picture-in-picture";
        iframe.allowFullscreen = true;

        document.getElementById("trailerPlayer").replaceChildren(iframe);
        document.getElementById("trailerModal").hidden = false;
    } catch (error) {
        console.error(error);
        showToast("Unable to load trailer.");
    }
}

function playHeroTrailer() {
    if (!heroMovie) {
        showToast("The featured movie is still loading.");
        return;
    }

    openTrailer(heroMovie.id, heroTrailerKey);
}

function loadPreview(card, movieId) {
    card.previewTimer = setTimeout(async () => {
        if (!card.matches(":hover")) return;

        try {
            const data = await fetchMovies(`/movie/${movieId}/videos`);
            const videos = Array.isArray(data.results) ? data.results : [];
            const trailer = videos.find(video =>
                video.site === "YouTube" && video.type === "Trailer" && video.key
            );
            if (!trailer || !card.matches(":hover")) return;

            const iframe = document.createElement("iframe");
            iframe.className = "preview";
            iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&mute=1&controls=0`;
            iframe.title = "Movie trailer preview";
            iframe.allow = "autoplay; encrypted-media";
            card.appendChild(iframe);
        } catch (error) {
            console.error(error);
        }
    }, 700);
}

function signIn() {
    const modal = document.getElementById("loginModal");
    if (modal) modal.hidden = false;

    const email = document.getElementById("email");
    if (email) email.focus();
}

function closeLogin() {
    const modal = document.getElementById("loginModal");
    const error = document.getElementById("loginError");
    if (modal) modal.hidden = true;
    if (error) error.textContent = "";
}

function login(event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const error = document.getElementById("loginError");

    if (!email || password.length < 4) {
        error.textContent = "Please enter a valid email and a password of at least 4 characters.";
        return;
    }

    localStorage.setItem("netflixDemoUser", email);
    closeLogin();
    updateAccount();
    showToast(`Welcome back, ${email.split("@")[0]}.`);
}

function signOut() {
    localStorage.removeItem("netflixDemoUser");
    updateAccount();
    showToast("You have signed out.");
}

function updateAccount() {
    const user = localStorage.getItem("netflixDemoUser");
    const signInButton = document.getElementById("signInButton");
    const signOutButton = document.getElementById("signOutButton");
    const welcomeUser = document.getElementById("welcomeUser");

    if (signInButton) signInButton.hidden = Boolean(user);
    if (signOutButton) signOutButton.hidden = !user;
    if (welcomeUser) {
        welcomeUser.hidden = !user;
        welcomeUser.textContent = user ? `Hi, ${user.split("@")[0]}` : "";
    }
}

function closeTrailer() {
    const modal = document.getElementById("trailerModal");
    const player = document.getElementById("trailerPlayer");
    if (modal) modal.hidden = true;
    if (player) player.replaceChildren();
}

function getStarted() {
    document.getElementById("movies").scrollIntoView({
        behavior: "smooth"
    });
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 2800);
}

function initialize() {
    updateAccount();
    loadMovies();

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", login);
    }

    const loginModal = document.getElementById("loginModal");
    if (loginModal) {
        loginModal.addEventListener("click", event => {
            if (event.target === loginModal) closeLogin();
        });
    }

    const trailerModal = document.getElementById("trailerModal");
    if (trailerModal) {
        trailerModal.addEventListener("click", event => {
            if (event.target === trailerModal) closeTrailer();
        });
    }
}

document.addEventListener("DOMContentLoaded", initialize, { once: true });
