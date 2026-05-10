import assert from "node:assert/strict";
import test from "node:test";

import {
  extractTournamentIdsFromOngoingHtml,
  getLatestRelevantPairings,
  hydratePairingGroup,
  mergeTeamsIntoPairingGroup,
  parsePublicPairingsHtml,
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
