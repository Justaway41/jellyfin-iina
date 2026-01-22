# Jellyfin IINA Plugin

This is a small side project to make watching Jellyfin content in IINA easier. It is largerly vibe coded and made for my specific setup, so it might not be the best fit for you but hopefuly someone finds it useful.

## Installation

1. In IINA, open Settings > Plugins.
2. Select Install from GitHub.
3. Enter `ada-bee/jellyfin-iina`
4. Restart IINA if it does not appear immediately.

## Usage

- Open the Jellyfin sidebar with Shift+J.
- In the future you can use the Resume watching `Jellyfin.png` to skip the select video dialog faster (or, if Jellyfin is your main use case for IINA, have it autoplay when IINA opens and it will automatically pop the sidebar).

## Features

- Direct stream playback from Jellyfin.
- Library search and browsing.
- Proper media name formatting in the window title.
- Playback progress reporting back to the Jellyfin server.
- Resume playback from last position.
- Session persistence for server and login.
- Only TV and Movie libraries are supported at the moment.

## Screenshots

![Screenshot 1](images/screenshot-1.jpg)

![Screenshot 2](images/screenshot-2.jpg)

## TODO

- Auto-play next episode (soon-ish).
- Intro skipper (not that soon, i can't figure out how to make an overlay button clickable, please help).
