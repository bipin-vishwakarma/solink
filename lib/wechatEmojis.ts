// Dedicated WeChat expressions dataset and search helpers.
// Only includes WeChat's official & signature expressions — standard system
// emojis are omitted because they already exist on user mobile keyboards.

export interface WechatEmoji {
  code: string; // e.g. "[Doge]"
  name: string; // e.g. "Doge"
  char: string; // Unicode representation, e.g. "🐶"
  tags: string[];
}

export const WECHAT_EMOJIS: WechatEmoji[] = [
  { code: "[Doge]", name: "Doge", char: "🐶", tags: ["doge", "shiba", "dog", "wow", "cute"] },
  { code: "[Facepalm]", name: "Facepalm", char: "🤦", tags: ["facepalm", "smh", "disaster", "cringe"] },
  { code: "[Smart]", name: "Smart", char: "🤓", tags: ["smart", "nerd", "big brain", "galaxy brain", "think"] },
  { code: "[Hey]", name: "Hey / Kung Fu", char: "🙋", tags: ["hey", "kung fu", "hi", "greet", "punch"] },
  { code: "[Drool]", name: "Drool", char: "🤤", tags: ["drool", "hungry", "yummy", "sleepy"] },
  { code: "[Grimace]", name: "Grimace", char: "😬", tags: ["grimace", "nervous", "yikes", "awkward"] },
  { code: "[CoolGuy]", name: "Cool Guy", char: "😎", tags: ["cool", "shades", "sunglasses", "boss"] },
  { code: "[Crazy]", name: "Crazy", char: "🤪", tags: ["crazy", "wild", "goofy", "silly", "party"] },
  { code: "[Shy]", name: "Shy", char: "😳", tags: ["shy", "blush", "embarrassed", "flushed"] },
  { code: "[Sweat]", name: "Sweat", char: "😅", tags: ["sweat", "nervous", "relief", "close call"] },
  { code: "[Chuckle]", name: "Chuckle", char: "🤭", tags: ["chuckle", "giggle", "hand over mouth", "teehee"] },
  { code: "[Joyful]", name: "Joyful", char: "😂", tags: ["joy", "lol", "lmao", "haha", "laugh", "tears"] },
  { code: "[Terror]", name: "Terror", char: "😱", tags: ["terror", "scream", "scared", "shocked"] },
  { code: "[Speechless]", name: "Speechless", char: "🫥", tags: ["speechless", "blank", "dotted", "invisible"] },
  { code: "[Emm]", name: "Emm / Think", char: "🤔", tags: ["emm", "think", "wonder", "hmm", "curious"] },
  { code: "[Respect]", name: "Respect", char: "🙇", tags: ["respect", "bow", "humble", "apology"] },
  { code: "[Salute]", name: "Salute", char: "🫡", tags: ["salute", "yes sir", "respect", "honor"] },
  { code: "[RedPacket]", name: "Red Packet", char: "🧧", tags: ["red packet", "lucky", "money", "angpao", "gift"] },
  { code: "[Firecracker]", name: "Firecracker", char: "🧨", tags: ["firecracker", "new year", "bang", "celebrate"] },
  { code: "[Toasted]", name: "Toasted / Dizzy", char: "🥴", tags: ["toasted", "dizzy", "drunk", "woozy"] },
  { code: "[Sigh]", name: "Sigh", char: "😮‍💨", tags: ["sigh", "tired", "exhale", "relief"] },
  { code: "[Worry]", name: "Worry", char: "😟", tags: ["worry", "concerned", "troubled", "sad"] },
  { code: "[Tears]", name: "Tears / Cry", char: "😭", tags: ["tears", "cry", "bawling", "sob", "sad"] },
  { code: "[Party]", name: "Party", char: "🥳", tags: ["party", "celebrate", "birthday", "yay", "cheers"] },
  { code: "[Awesome]", name: "Awesome / Call Me", char: "🤙", tags: ["awesome", "shaka", "call me", "cool", "chill"] },
  { code: "[Rose]", name: "Rose", char: "🌹", tags: ["rose", "flower", "love", "romance", "gift"] },
  { code: "[Wilt]", name: "Wilt", char: "🥀", tags: ["wilt", "faded", "dying rose", "rejected", "sad"] },
  { code: "[Beer]", name: "Beer / Cheers", char: "🍻", tags: ["beer", "cheers", "drinks", "party", "bar"] },
  { code: "[Cake]", name: "Cake", char: "🎂", tags: ["cake", "birthday", "sweet", "celebrate"] },
  { code: "[Bomb]", name: "Bomb", char: "💣", tags: ["bomb", "boom", "explode", "angry", "blast"] },
  { code: "[Cleaver]", name: "Cleaver / Knife", char: "🔪", tags: ["cleaver", "knife", "blade", "cook", "cut"] },
  { code: "[Moon]", name: "Moon / Goodnight", char: "🌙", tags: ["moon", "goodnight", "night", "sleep"] },
  { code: "[Sun]", name: "Sun / Morning", char: "☀️", tags: ["sun", "morning", "sunny", "bright"] },
  { code: "[Hug]", name: "Hug", char: "🤗", tags: ["hug", "warm", "cuddle", "comfort", "friendly"] },
  { code: "[Strong]", name: "Strong / Flex", char: "💪", tags: ["strong", "flex", "muscle", "power", "gym"] },
  { code: "[Shake]", name: "Handshake / Deal", char: "🤝", tags: ["handshake", "deal", "agree", "partner"] },
  { code: "[Victory]", name: "Victory / Peace", char: "✌️", tags: ["victory", "peace", "two", "win"] },
  { code: "[Pig]", name: "Pig", char: "🐷", tags: ["pig", "oink", "cute", "sleepy"] },
  { code: "[Heart]", name: "Heart / Love", char: "❤️", tags: ["heart", "love", "red heart", "like"] },
  { code: "[BrokenHeart]", name: "Broken Heart", char: "💔", tags: ["broken heart", "heartbreak", "sad", "sadness"] },
  { code: "[Pray]", name: "Pray / Thanks", char: "🙏", tags: ["pray", "thanks", "please", "bless", "grateful"] },
  { code: "[Clap]", name: "Clap", char: "👏", tags: ["clap", "applause", "bravo", "great job"] },
  { code: "[ThumbsUp]", name: "Thumbs Up", char: "👍", tags: ["thumbs up", "good", "yes", "like", "agree"] },
  { code: "[ThumbsDown]", name: "Thumbs Down", char: "👎", tags: ["thumbs down", "bad", "no", "dislike"] },
  { code: "[Fist]", name: "Fist / Bro", char: "✊", tags: ["fist", "solidarity", "power", "stay strong"] },
  { code: "[Punch]", name: "Punch", char: "👊", tags: ["punch", "strike", "hit", "boom"] },
  { code: "[Coffee]", name: "Coffee", char: "☕", tags: ["coffee", "tea", "cappuccino", "cafe", "break"] },
  { code: "[Watermelon]", name: "Watermelon", char: "🍉", tags: ["watermelon", "eating melon", "drama", "gossip"] },
  { code: "[Noodles]", name: "Noodles", char: "🍜", tags: ["noodles", "ramen", "food", "dinner", "lunch"] },
  { code: "[Boba]", name: "Boba / Milk Tea", char: "🧋", tags: ["boba", "bubble tea", "milk tea", "drink"] },
];

export function searchWechatEmojis(query: string): WechatEmoji[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return WECHAT_EMOJIS;
  return WECHAT_EMOJIS.filter(
    (e) =>
      e.name.toLowerCase().includes(trimmed) ||
      e.code.toLowerCase().includes(trimmed) ||
      e.tags.some((tag) => tag.includes(trimmed))
  );
}
