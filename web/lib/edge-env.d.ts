// Minimal ambient declaration for the Vercel edge functions in api/.
//
// They only ever read environment variables, so declaring process.env is
// enough — pulling in @types/node would drag the whole Node surface into a
// runtime that doesn't have it, and would let genuinely-unavailable APIs
// typecheck clean.
declare const process: {
  env: Record<string, string | undefined>
}
