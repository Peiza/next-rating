/*
 * Data exactly as the single-player version (storage key next-rating:v1)
 * saved it: written by that version's own app code in a test, not by hand.
 * The user saved PDGA number 100001, then ran the bookmarklet on the ratings
 * details page of another player, 100002, which fetched the profile page and
 * one event page with rows for both players. All names, numbers and results
 * are invented.
 */
export const LIVE_V1 =
  '{"pdgaNumber":100001,"language":null,"theme":null,"lastImport":{"at":"2026-10-20T12:21:37.064Z","player":{"pdgaNumber":"100002","name":"Other Player","currentRating":"1001","ratingDate":"(as of 08-Sep-2026)"},"details":[{"eventId":"900001","eventName":"Example Open","tier":"C","date":"6-Aug-2026","division":"MA1","round":"1","roundLabel":"1","score":"54","rating":"1000","holes":"","evaluated":"Yes","included":"Yes"},{"eventId":"900001","eventName":"Example Open","tier":"C","date":"6-Aug-2026","division":"MA1","round":"2","roundLabel":"2","score":"54","rating":"1010","holes":"","evaluated":"Yes","included":"Yes"}],"profileEvents":[{"eventId":"900005","division":"MPO","name":"Example Open","tier":"B","date":"20-Sep-2026"}],"events":[{"eventId":"900005","name":"Example Open","date":"Date: 19-Sep to 20-Sep-2026","status":"unofficial","divisions":[{"division":"MPO","holes":[""],"rows":[{"pdgaNumber":"100002","name":"Other Player","rounds":[{"score":"52","rating":"1020"}]},{"pdgaNumber":"100001","name":"Test Player","rounds":[{"score":"58","rating":"940"}]}]}]}]}}';
