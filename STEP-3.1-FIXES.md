# Step 3.1 fixes

This maintenance update closes the two audit findings from Step 3:

1. `app/globals.css` is now included as a complete production stylesheet. The README explicitly explains CSS integration. `globals.step3.css` remains only as a reference fragment.
2. The desktop `.decision-strip` now uses `repeat(6, 1fr)` to match the six decision states.

No changes were made to the Step 3 feed-fetching, validation, fallback, Evidence Gate, or secret-handling logic.
