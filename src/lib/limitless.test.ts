import assert from "node:assert/strict";
import test from "node:test";

import {
  extractTournamentIdsFromOngoingHtml,
  getLatestRelevantPairings,
  hydratePairingGroup,
  mergeTeamsIntoPairingGroup,
  parsePublicPairingsHtml,
  parsePublicStandingsHtml,
  parsePublicTournamentDetailsHtml,
  parseStandingsResponse,
  standingsIndexByPlayer
} from "./limitless";

test("extracts unique tournament ids from ongoing page links", () => {
  const html = `
    <a href="/tournament/abc123/pairings">Pairings</a>
    <a href="/tournament/abc123/standings">Standings</a>
    <a href="/tournament/def456/pairings">Pairings</a>
  `;

  assert.deepEqual(extractTournamentIdsFromOngoingHtml(html), ["abc123", "def456"]);
});

test("prefers the latest unresolved normal pairing group", () => {
  const result = getLatestRelevantPairings([
    { phase: 1, round: 1, table: 1, player1: "a", player2: "b", winner: "a" },
    { phase: 1, round: 2, table: 1, player1: "c", player2: "d" },
    { phase: 1, round: 3, table: 1, player1: "e" }
  ]);

  assert.equal(result.status, "active");
  assert.equal(result.round, 2);
  assert.equal(result.pairings.length, 1);
});

test("falls back to latest completed round when no active matches exist", () => {
  const result = getLatestRelevantPairings([
    { phase: 1, round: 1, table: 1, player1: "a", player2: "b", winner: "a" },
    { phase: 1, round: 2, table: 1, player1: "c", player2: "d", winner: "d" }
  ]);

  assert.equal(result.status, "completed");
  assert.equal(result.round, 2);
});

test("hydrates player display names and six pokemon team slots", () => {
  const group = hydratePairingGroup(
    [{ phase: 1, round: 1, table: 1, player1: "p1", player2: "p2" }],
    [
      {
        player: "p1",
        name: "Player One",
        decklist: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
          { id: "c", name: "C" },
          { id: "d", name: "D" },
          { id: "e", name: "E" },
          { id: "f", name: "F" },
          { id: "g", name: "G" }
        ]
      },
      {
        player: "p2",
        name: "Player Two",
        decklist: [{ id: "x", name: "X" }]
      }
    ]
  );

  assert.equal(group.pairings[0].player1.name, "Player One");
  assert.equal(group.pairings[0].player1.team.length, 6);
  assert.equal(group.pairings[0].player2?.team[0].name, "X");
});

test("parses public tournament details when active API is unavailable", () => {
  const details = parsePublicTournamentDetailsHtml(
    "abc123",
    '<title>Pairings: Champions League | Limitless</title><meta name="description" content="April 18, 2026 - Custom format - Shapeless Esport">'
  );

  assert.equal(details.id, "abc123");
  assert.equal(details.game, "VGC");
  assert.equal(details.name, "Champions League");
  assert.equal(details.format, "Custom format");
  assert.equal(details.organizer?.name, "Shapeless Esport");
});

test("parses standings API JSON into trimmed pokemon slots (teams come from standings, not pairings)", () => {
  const standings = parseStandingsResponse([
    {
      player: "alice",
      name: "Alice",
      decklist: [
        {
          id: "pikachu",
          name: "Pikachu",
          item: null,
          ability: "Static",
          attacks: ["Thunderbolt"],
          tera: null
        }
      ]
    }
  ]);

  assert.equal(standings.length, 1);
  assert.equal(standings[0].decklist?.length, 1);
  assert.equal(standings[0].decklist?.[0].id, "pikachu");
  assert.ok(!("attacks" in (standings[0].decklist?.[0] ?? {})));
});

test("hydrates teams when pairing ids match standings case-insensitively", () => {
  const group = hydratePairingGroup(
    [{ phase: 1, round: 1, table: 1, player1: "AliceUser", player2: "bob_user" }],
    parseStandingsResponse([
      {
        player: "aliceuser",
        name: "Alice Display",
        decklist: [{ id: "eevee", name: "Eevee" }]
      },
      {
        player: "BOB_USER",
        name: "Bob Display",
        decklist: [{ id: "snorlax", name: "Snorlax" }]
      }
    ])
  );

  assert.equal(group.pairings[0].player1.team[0]?.id, "eevee");
  assert.equal(group.pairings[0].player2?.team[0]?.id, "snorlax");
});

test("mergeTeamsIntoPairingGroup restores teams from stored standings after empty hydrated slots", () => {
  const standings = parseStandingsResponse([
    {
      player: "p1",
      name: "One",
      decklist: [{ id: "eevee", name: "Eevee" }]
    }
  ]);

  const merged = mergeTeamsIntoPairingGroup(
    {
      phase: 1,
      round: 1,
      status: "active",
      pairings: [
        {
          key: "k1",
          phase: 1,
          round: 1,
          completed: false,
          player1: { id: "p1", name: "One", team: [] },
          player2: undefined
        }
      ]
    },
    standings
  );

  assert.equal(merged.pairings[0].player1.team[0]?.id, "eevee");
});

test("standings index dedupes by primary player id", () => {
  const map = standingsIndexByPlayer([
    { player: "One", name: "A", decklist: [] },
    { player: "two", name: "B", decklist: [] }
  ]);

  assert.equal(map.get("One")?.name, "A");
  assert.equal(map.get("two")?.name, "B");
});

test("parses teamlists from the public standings page when JSON standings are gated", () => {
  const standings = parsePublicStandingsHtml(`
    <table class="striped">
      <tr data-placing="1" data-name="Alice" data-country="US">
        <td>1</td>
        <td><a href="/tournament/abc/player/alice">Alice</a></td>
        <td class="vgc-team">
          <a href="/tournament/abc/metagame/whimsicott" data-tooltip="Whimsicott"><img/></a>
          <a href="/tournament/abc/metagame/floette-eternal" data-tooltip="Eternal Flower Floette"><img/></a>
        </td>
      </tr>
      <tr data-placing="2" data-name="Bob">
        <td>2</td>
        <td><a href="/tournament/abc/player/bob">Bob</a></td>
        <td class="vgc-team"></td>
      </tr>
    </table>
  `);

  assert.equal(standings.length, 2);
  assert.equal(standings[0].player, "alice");
  assert.equal(standings[0].decklist?.length, 2);
  assert.equal(standings[0].decklist?.[0].id, "whimsicott");
  assert.equal(standings[0].decklist?.[1].name, "Eternal Flower Floette");
  assert.equal(standings[1].decklist?.length, 0);
});

test("parses bracket-match blocks during live top cut", () => {
  const parsed = parsePublicPairingsHtml(`
    <div class="bracket-container"><div class="live-bracket"><div class="bracket-matches">
      <div class="bracket-match" data-slot="T8-1" data-wm="T4-1" data-match="m1">
        <a class="label">T8-1</a>
        <div class="players">
          <div class="live-bracket-player" data-id="alice"><a class="name" href="#">Alice</a><div class="score">1</div></div>
          <div class="live-bracket-player winner" data-id="bob"><a class="name" href="#">Bob</a><div class="score">2</div></div>
        </div>
      </div>
      <div class="bracket-match" data-slot="T8-2" data-match="m2">
        <a class="label">T8-2</a>
        <div class="players">
          <div class="live-bracket-player" data-id="cara"><a class="name" href="#">Cara</a><div class="score">0</div></div>
          <div class="live-bracket-player" data-id="dave"><a class="name" href="#">Dave</a><div class="score">0</div></div>
        </div>
      </div>
    </div></div></div>
  `);

  assert.equal(parsed.pairings.length, 2);
  assert.equal(parsed.pairings[0].phase, 2);
  assert.equal(parsed.pairings[0].player1, "alice");
  assert.equal(parsed.pairings[0].player2, "bob");
  assert.equal(parsed.pairings[0].winner, "bob");
  assert.equal(parsed.pairings[0].match, "T8-1");
  assert.equal(parsed.pairings[1].winner, undefined);
  assert.equal(parsed.standings.length, 4);
});

test("parses public active pairings and player display names", () => {
  const parsed = parsePublicPairingsHtml(`
    <table data-tournament="abc123" data-round="3">
      <tr data-match="m1" data-completed="0">
        <td>1</td>
        <td class="player" data-id="alice"><a><div class="name">Alice</div></a></td>
        <td></td><td></td>
        <td class="player" data-id="bob"><a><div class="name">Bob</div></a></td>
      </tr>
      <tr data-match="m2" data-completed="1" data-winner="cara">
        <td>2</td>
        <td class="player winner" data-id="cara"><a><div class="name">Cara</div></a></td>
        <td></td><td></td><td><span class="nocontest">bye</span></td>
      </tr>
    </table>
  `);

  assert.equal(parsed.pairings[0].round, 3);
  assert.equal(parsed.pairings[0].player1, "alice");
  assert.equal(parsed.pairings[0].player2, "bob");
  assert.equal(parsed.pairings[1].player2, undefined);
  assert.equal(parsed.standings.find((standing) => standing.player === "alice")?.name, "Alice");
});
