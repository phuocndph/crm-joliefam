// This is a frozen record of the ledger observed before the bounded Item5A
// installation. It is deliberately independent from the mutable migration
// directory and from any staging/rehearsal artefact.
export const item5aHistoricalLedgerManifest = {
  entries: 73,
  // SHA-256 of the 73 sorted `name\tchecksum\tsource` rows. The final row is
  // the adopted __seed.sql marker recorded at the historical boundary.
  sortedRowsSha256: "428dbc294b2ba6f8ad92ae99d261f8fe09bef6816a773ee70466f6b4745e32e1",
  adoptedSeed: {
    name: "__seed.sql",
    checksum: "59e2b8a088876aecca72a2e971a1af420322bec08e4c23bbef792e2551fe1cca",
    source: "ADOPTED",
  },
} as const;
