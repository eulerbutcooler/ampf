// Typed access to the "now" snapshots written by scripts/sync-now.mjs.
// Empty objects mean "no data yet" and the section renders nothing.
import readingJson from "./reading.json";
import spotifyJson from "./spotify.json";

export interface Reading {
    title: string;
    author: string;
    url: string;
    syncedAt: string;
}

export interface Listening {
    track: string;
    artist: string;
    album: string | null;
    url: string | null;
    playedAt: string;
    nowPlaying: boolean;
    syncedAt: string;
}

export const reading: Reading | null = (readingJson as Partial<Reading>).title
    ? (readingJson as Reading)
    : null;

export const listening: Listening | null = (spotifyJson as Partial<Listening>)
    .track
    ? (spotifyJson as Listening)
    : null;
