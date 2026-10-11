// Size limits shared by the validators and the Mongoose schemas, so the
// API and the database can never disagree about what is allowed.
export const LIMITS = {
  USER_NAME_MAX: 60,
  EMAIL_MAX: 254,
  PASSWORD_MIN: 8,
  // bcrypt only uses the first 72 bytes of a password; longer ones would
  // silently match on their prefix, so they are rejected instead.
  PASSWORD_MAX_BYTES: 72,

  FOLDER_NAME_MAX: 60,
  FOLDERS_PER_USER: 200,

  ITEM_NAME_MAX: 100,
  ITEM_CATEGORY_MAX: 40,
  ITEM_DESCRIPTION_MAX: 500,
  ITEM_GROUP_MAX: 40,
  ITEM_PRICE_MAX: 10_000_000, // rupees
  ITEM_PRICE_UNIT_MAX: 20, // "kg", "piece", "500 g"…
  ITEM_QUANTITY_MAX: 100_000,
  ITEMS_PER_FOLDER: 1000,
  SAVED_ITEMS_PER_USER: 500,
  SEARCH_QUERY_MAX: 100,
  SHARES_PER_FOLDER: 50,
  USER_SEARCH_MIN: 2,
  USER_SEARCH_RESULTS: 8,

  CHAT_MESSAGE_MAX: 1000,
  /** Messages loaded when the chat opens. */
  CHAT_HISTORY: 50,
  /** People tracked per list (bounds memory if someone floods fake guest ids). */
  PRESENCE_PER_FOLDER: 100,
} as const;
