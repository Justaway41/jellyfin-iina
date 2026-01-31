import { ui } from "../dom";
import { state } from "../state";
import { log, normalizeQuery } from "../utils";
import { loadHome, performSearch, reloadEpisodes, reloadItems, reloadSeasons } from "./loaders";

export function updateSearchState(query: string): void {
    state.searchQuery = query;
    ui.clearSearchButton.classList.toggle("hidden", !query);
}

export function resetSearchState(shouldReload: boolean = true): void {
    ui.searchInput.value = "";
    updateSearchState("");

    if (shouldReload) {
        void loadHome();
    }
}

export function handleBack(): void {
    if (state.breadcrumb.length === 0) {
        return;
    }

    state.breadcrumb.pop();

    if (state.breadcrumb.length === 0) {
        state.currentLibrary = null;
        state.currentSeries = null;
        state.currentSeason = null;
        updateSearchState("");
        void loadHome();
        return;
    }

    const prev = state.breadcrumb[state.breadcrumb.length - 1];
    switch (prev.type) {
        case "library":
            state.currentSeries = null;
            state.currentSeason = null;
            void reloadItems(prev);
            break;
        case "series":
            state.currentSeason = null;
            void reloadSeasons(prev);
            break;
        case "season":
            void reloadEpisodes(prev);
            break;
    }
}

export function handleRetry(): void {
    if (state.lastAction) {
        void state.lastAction();
    }
}

export function goHomeFresh(reason: string = ""): void {
    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
    state.currentSeason = null;
    state.lastAction = null;
    resetSearchState(false);
    if (reason) {
        log("Returning home:", reason);
    }
    void loadHome();
}

export function handleRefresh(): void {
    goHomeFresh("home-button");
}

export function handleSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const query = normalizeQuery(value);
    updateSearchState(query);

    if (!query) {
        resetSearchState(true);
    }
}

export function handleClearSearch(): void {
    resetSearchState(true);
}

export function handleSearchSubmit(event: Event): void {
    event.preventDefault();
    const query = normalizeQuery(ui.searchInput.value);
    updateSearchState(query);

    if (!query) {
        resetSearchState(true);
        return;
    }

    void performSearch(query);
}
