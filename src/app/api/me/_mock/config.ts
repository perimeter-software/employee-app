// Single switch for the self-service `/me/*` mock. Flip to false when the real
// gig-v4-backend endpoints exist, then delete the `_mock` folder and the mock
// branches in the route handlers.
export const USE_MOCK = true;
