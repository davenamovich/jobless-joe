/**
 * Ready-made Old Joe song concepts (from Dave's master prompt, 2026-10-20).
 * One click writes the song, so nobody has to know what to write. Each topic
 * is the premise the songwriter gets as a custom topic.
 */
export interface SongIdea {
  label: string;
  topic: string;
}

export const SONG_IDEAS: SongIdea[] = [
  {
    label: "I Trained the AI That Took My Job",
    topic:
      "I Trained the AI That Took My Job: Joe gets fired, is hired back to train his replacement, and discovers the replacement is a chatbot that never takes lunch.",
  },
  {
    label: "I Sold Bitcoin for a Sandwich",
    topic:
      "I Sold Bitcoin for a Sandwich: Joe explains how he traded generational wealth for a disappointing lunch and a bag of chips.",
  },
  {
    label: "LinkedIn Says I'm Thriving",
    topic:
      "LinkedIn Says I'm Thriving: Joe is unemployed, eating cereal for dinner, and posting about his exciting new professional journey.",
  },
  {
    label: "My Nephew Built a Company in His Pajamas",
    topic:
      "My Nephew Built a Company in His Pajamas: Joe spent 30 years climbing the corporate ladder. His nephew built a competitor over the weekend with AI.",
  },
  {
    label: "Entry-Level Job, Senior-Level Experience",
    topic:
      "Entry-Level Job, Senior-Level Experience: Joe applies for a job requiring 15 years of experience with technology invented six months ago.",
  },
  {
    label: "The Billion-Dollar Company With No Customers",
    topic:
      "The Billion-Dollar Company With No Customers: VCs throw billions at a startup while Joe can't get a $20 loan to buy groceries.",
  },
  {
    label: "My Retirement Plan Is a Meme Coin",
    topic:
      "My Retirement Plan Is a Meme Coin: Joe's financial advisor is a guy with a cartoon frog profile picture.",
  },
  {
    label: "The Robot Has Better Benefits",
    topic:
      "The Robot Has Better Benefits: Joe discovers that his AI replacement works 24/7, never complains, and somehow has better job security.",
  },
];
