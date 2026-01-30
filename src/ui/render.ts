import type { JellyfinBaseItem } from "../shared/jellyfin";

import { ui } from "./dom";
import { state } from "./state";
import { escapeHtml, formatEpisodeNumber, formatRuntime } from "./utils";

export interface ListCardOptions {
    showSeriesName?: boolean;
    showEpisodeNumber?: boolean;
    useEpisodeThumbnail?: boolean;
    showSeriesEpisodeCounts?: boolean;
}

export interface CardContext {
    id: string;
    name: string;
    type: string;
    resume: number;
    context: {
        seriesId: string;
        seasonId: string;
        episodeIndex: number | null;
    };
}

export function showLoginView(): void {
    ui.loginView.classList.remove("hidden");
    ui.browseView.classList.add("hidden");
}

export function showBrowseView(): void {
    ui.loginView.classList.add("hidden");
    ui.browseView.classList.remove("hidden");
}

export function updateServerHeader(displayName: string, hostName: string): void {
    ui.serverName.textContent = displayName || hostName;
    ui.serverHost.textContent = hostName;
}

export function showLoading(): void {
    ui.loading.classList.remove("hidden");
    ui.content.classList.add("hidden");
    ui.errorState.classList.add("hidden");
}

export function hideLoading(): void {
    ui.loading.classList.add("hidden");
    ui.content.classList.remove("hidden");
}

export function renderEmptyState(message: string): void {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = message;
    ui.content.innerHTML = "";
    ui.content.appendChild(emptyState);
}

export function showError(message: string): void {
    ui.loading.classList.add("hidden");
    ui.content.classList.add("hidden");
    ui.errorState.classList.remove("hidden");
    ui.errorMessage.textContent = message;
}

export function updateTitle(title: string): void {
    ui.sectionTitle.textContent = title;
    const showHeader = state.breadcrumb.length > 0 || title !== "Home";
    ui.sectionHeader.classList.toggle("hidden", !showHeader);
    ui.backBtn.classList.toggle("hidden", state.breadcrumb.length === 0);
}

export function renderListCards(items: JellyfinBaseItem[], options: ListCardOptions = {}): void {
    const html = `
        <div class="media-list">
            ${items.map(item => buildListCard(item, options)).join("")}
        </div>
    `;

    ui.content.innerHTML = html;
}

export function renderHomeSections(
    nextUpItems: JellyfinBaseItem[],
    recentMovies: JellyfinBaseItem[],
    recentEpisodes: JellyfinBaseItem[]
): void {
    const sections = [
        { title: "Up Next", items: nextUpItems },
        { title: "Latest Movies", items: recentMovies },
        { title: "Latest TV", items: recentEpisodes }
    ];

    const html = sections.map(section => {
        const items = section.items || [];
        if (items.length === 0) {
            return `
                <div class="home-section">
                    <h3>${section.title}</h3>
                    <div class="empty-state" data-empty="true">No items found</div>
                </div>
            `;
        }
        return `
            <div class="home-section">
                <h3>${section.title}</h3>
                <div class="media-list">
                    ${items.map(item => buildListCard(item, {
                        showSeriesName: section.title === "Up Next" || section.title === "Latest TV",
                        showEpisodeNumber: true
                    })).join("")}
                </div>
            </div>
        `;
    }).join("");

    ui.content.innerHTML = html;
}

export function renderSeriesOverview(nextUpItem: JellyfinBaseItem | null, seasons: JellyfinBaseItem[]): void {
    const sections: string[] = [];

    if (nextUpItem) {
        sections.push(`
            <div class="home-section">
                <h3>Up Next</h3>
                <div class="media-list">
                    ${buildListCard(nextUpItem, {
                        showSeriesName: false,
                        showEpisodeNumber: true,
                        useEpisodeThumbnail: true
                    })}
                </div>
            </div>
        `);
    }

    if (seasons.length > 0) {
        sections.push(`
            <div class="season-section">
                <h3>Seasons</h3>
                <div class="season-grid">
                    ${seasons.map(season => buildSeasonCard(season)).join("")}
                </div>
            </div>
        `);
    }

    ui.content.innerHTML = sections.join("");
}

export function renderSearchResults(items: JellyfinBaseItem[]): void {
    const grouped: Record<string, JellyfinBaseItem[]> = {
        Movie: [],
        Series: [],
        Episode: []
    };

    items.forEach(item => {
        if (item.Type && grouped[item.Type]) {
            grouped[item.Type].push(item);
        }
    });

    const sections = [
        {
            title: "Movies",
            items: grouped.Movie,
            options: { showSeriesName: false, showEpisodeNumber: false, useEpisodeThumbnail: true }
        },
        {
            title: "Shows",
            items: grouped.Series,
            options: {
                showSeriesName: false,
                showEpisodeNumber: false,
                useEpisodeThumbnail: true,
                showSeriesEpisodeCounts: true
            }
        },
        {
            title: "Episodes",
            items: grouped.Episode,
            options: { showSeriesName: true, showEpisodeNumber: true, useEpisodeThumbnail: true }
        }
    ];

    const visibleSections = sections.filter(section => section.items.length > 0);
    if (visibleSections.length === 0) {
        renderEmptyState("No results found");
        return;
    }

    const html = visibleSections.map(section => `
        <div class="result-section">
            <h3>${section.title}</h3>
            <div class="media-list">
                ${section.items.map(item => buildListCard(item, section.options)).join("")}
            </div>
        </div>
    `).join("");

    ui.content.innerHTML = html;
}

export function findListCard(target: EventTarget | null): HTMLElement | null {
    if (!target || !(target as HTMLElement).closest) {
        return null;
    }
    return (target as HTMLElement).closest(".list-card");
}

export function getCardContext(card: HTMLElement | null): CardContext | null {
    if (!card) {
        return null;
    }

    const id = card.dataset.id || "";
    const name = card.dataset.name || "";
    const type = card.dataset.type || "";
    const resume = Number.parseInt(card.dataset.resume || "0", 10) || 0;

    return {
        id,
        name,
        type,
        resume,
        context: {
            seriesId: card.dataset.seriesId || "",
            seasonId: card.dataset.seasonId || "",
            episodeIndex: card.dataset.episodeIndex
                ? Number.parseInt(card.dataset.episodeIndex, 10)
                : null
        }
    };
}

export function handleContentError(event: Event): void {
    const imageElement = event.target as HTMLImageElement | null;
    if (!imageElement || imageElement.tagName !== "IMG") {
        return;
    }

    if (imageElement.classList.contains("season-thumb")) {
        handleImageFallback(imageElement);
        return;
    }

    if (imageElement.classList.contains("list-thumb")) {
        handleImageFallback(imageElement);
    }
}

function buildSeasonCard(season: JellyfinBaseItem): string {
    const imageUrl = getImageUrl(season.Id || "", "Primary", 240);
    const seriesPosterUrl = state.currentSeries?.id
        ? getImageUrl(state.currentSeries.id, "Primary", 240)
        : "";
    const seasonName = escapeHtml(season.Name);
    return `
        <div class="season-card list-card" data-id="${season.Id || ""}" data-name="${seasonName}" data-type="Season" data-resume="0" data-series-id="${state.currentSeries?.id || ""}" data-season-id="${season.Id || ""}" data-clickable tabindex="0" role="button">
            <div class="season-poster">
                <img class="season-thumb"
                     src="${imageUrl}"
                     data-fallback="${seriesPosterUrl}"
                     alt="${seasonName}"
                     loading="lazy">
            </div>
            <div class="season-title">${seasonName}</div>
        </div>
    `;
}

function buildListCard(item: JellyfinBaseItem, options: ListCardOptions): string {
    const metadata = buildMetadata(item, options);
    const runtime = formatRuntime(item.RunTimeTicks || undefined);
    const durationLabel = buildDurationLabel(item, runtime, options);
    const progressBar = renderThumbProgress(item);

    const seriesId = item.SeriesId || "";
    const seasonId = item.SeasonId || item.ParentId || "";
    const episodeIndex = item.IndexNumber !== undefined && item.IndexNumber !== null
        ? item.IndexNumber
        : "";
    const thumbnailUrl = getThumbnailUrl(item, options);
    const useEpisodeFallback = Boolean(options.useEpisodeThumbnail && item.Type === "Episode" && seriesId);
    const useBackdropFallback = item.Type === "Movie" || item.Type === "Series";
    const fallbackThumbnailUrl = useEpisodeFallback
        ? getImageUrl(seriesId, "Thumb", 160)
        : (useBackdropFallback ? getImageUrl(item.Id || "", "Backdrop", 320) : "");
    const escapedName = escapeHtml(item.Name);

    return `
        <div class="list-card" data-id="${item.Id || ""}" data-name="${escapedName}" data-type="${item.Type || ""}" data-resume="${item.UserData?.PlaybackPositionTicks || 0}" data-series-id="${seriesId}" data-season-id="${seasonId}" data-episode-index="${episodeIndex}" data-clickable tabindex="0" role="button">
            <div class="thumb-wrapper">
                <img class="list-thumb"
                     src="${thumbnailUrl}"
                     data-fallback="${fallbackThumbnailUrl}"
                     data-item-id="${item.Id || ""}"
                     data-type="${item.Type || ""}"
                     alt="${escapedName}"
                     loading="lazy">
                <div class="play-overlay">&#9654;</div>
                ${progressBar}
            </div>
            <div class="list-body">
                <div class="list-title">${escapedName}</div>
                <div class="list-meta">${metadata}</div>
            </div>
            ${durationLabel}
        </div>
    `;
}

function buildDurationLabel(item: JellyfinBaseItem, runtime: string, options: ListCardOptions): string {
    if (options.showSeriesEpisodeCounts && item.Type === "Series") {
        const totalEpisodes = item.RecursiveItemCount || item.ChildCount || 0;
        const userData = item.UserData as (typeof item.UserData & { PlayedItemCount?: number }) | undefined;
        const playedCount = userData?.PlayedItemCount;
        const unplayedCount = userData?.UnplayedItemCount;
        const watchedEpisodes = playedCount !== undefined && playedCount !== null
            ? playedCount
            : (unplayedCount !== undefined && unplayedCount !== null
                ? Math.max(totalEpisodes - unplayedCount, 0)
                : 0);
        if (totalEpisodes > 0) {
            return `<div class="list-duration">${watchedEpisodes}/${totalEpisodes}</div>`;
        }
        return "";
    }

    return runtime ? `<div class="list-duration">${runtime}</div>` : "";
}

function buildMetadata(item: JellyfinBaseItem, options: ListCardOptions): string {
    const metaParts: Array<string | number> = [];

    if (options.showEpisodeNumber && item.Type === "Episode") {
        metaParts.push(formatEpisodeNumber(item.ParentIndexNumber, item.IndexNumber));
    }

    if (options.showSeriesName !== false && item.SeriesName) {
        metaParts.push(escapeHtml(item.SeriesName));
    }

    if (item.Type !== "Episode" && item.ProductionYear) {
        metaParts.push(item.ProductionYear);
    }

    return metaParts.filter(Boolean).join(" &bull; ");
}

function hasProgress(item: JellyfinBaseItem): boolean {
    return Boolean(item.UserData?.PlaybackPositionTicks && item.RunTimeTicks);
}

function renderThumbProgress(item: JellyfinBaseItem): string {
    if (!item || item.Type === "Series") {
        return "";
    }

    if (item.UserData?.Played) {
        return `
            <div class="thumb-progress">
                <div class="thumb-progress-fill thumb-progress-fill--complete" style="width: 100%"></div>
            </div>
        `;
    }

    if (!hasProgress(item)) {
        return "";
    }

    const runtimeTicks = item.RunTimeTicks || 0;
    const positionTicks = item.UserData?.PlaybackPositionTicks || 0;
    const progress = runtimeTicks ? (positionTicks / runtimeTicks) * 100 : 0;
    if (progress < 1) {
        return "";
    }

    return `
        <div class="thumb-progress">
            <div class="thumb-progress-fill thumb-progress-fill--partial" style="width: ${Math.min(progress, 100)}%"></div>
        </div>
    `;
}

function getImageUrl(itemId: string, imageType: string = "Primary", maxWidth: number = 120): string {
    if (!state.serverUrl) {
        return "";
    }
    return `${state.serverUrl}/Items/${itemId}/Images/${imageType}?maxWidth=${maxWidth}&quality=90`;
}

function getThumbnailUrl(item: JellyfinBaseItem, options: ListCardOptions = {}): string {
    if (!item) {
        return "";
    }

    if (options.useEpisodeThumbnail && item.Type === "Episode" && item.Id) {
        return getImageUrl(item.Id, "Primary", 160);
    }

    const imageId = item.Type === "Episode" && item.SeriesId ? item.SeriesId : item.Id || "";
    return getImageUrl(imageId, "Thumb", 160);
}

function handleImageFallback(imageElement: HTMLImageElement): void {
    if (!imageElement) {
        return;
    }

    const fallbackUrl = imageElement.dataset.fallback || "";
    if (fallbackUrl && imageElement.dataset.fallbackApplied !== "true") {
        imageElement.dataset.fallbackApplied = "true";
        imageElement.src = fallbackUrl;
        return;
    }

    const itemId = imageElement.dataset.itemId || "";
    const type = imageElement.dataset.type || "";
    const usedBackdrop = imageElement.dataset.backdropApplied === "true";
    if (!usedBackdrop && itemId && (type === "Movie" || type === "Series")) {
        imageElement.dataset.backdropApplied = "true";
        imageElement.src = getImageUrl(itemId, "Backdrop", 320);
        return;
    }

    imageElement.style.display = "none";
}
