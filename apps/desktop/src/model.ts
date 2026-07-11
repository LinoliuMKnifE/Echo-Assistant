export type Page =
  | 'chat'
  | 'conversations'
  | 'profile'
  | 'memories'
  | 'projects'
  | 'skills'
  | 'schedules'
  | 'tools'
  | 'audit'
  | 'settings'
  | 'backup';
export type MemoryMode = 'ask' | 'low-risk' | 'explicit';
export type Theme = 'light' | 'dark' | 'system';

export type Memory = {
  id: string;
  title: string;
  content: string;
  type: string;
  confidence: number;
  sensitivity: 'Low' | 'Medium' | 'High';
  source: string;
  learned: string;
  status: 'Confirmed' | 'Proposed' | 'Temporary' | 'Contradiction';
  expires?: string;
};

export const memories: Memory[] = [
  {
    id: 'm1',
    title: 'Communication style',
    content: 'Prefers short, step-by-step instructions.',
    type: 'Profile',
    confidence: 98,
    sensitivity: 'Low',
    source: 'Conversation: Packaging thank-you cards',
    learned: 'Jul 8, 2026',
    status: 'Confirmed',
  },
  {
    id: 'm2',
    title: 'Shipping deadline',
    content: 'eBay card samples need review this Friday.',
    type: 'Project',
    confidence: 100,
    sensitivity: 'Low',
    source: 'Conversation: Card sample timeline',
    learned: 'Jul 9, 2026',
    status: 'Temporary',
    expires: 'Jul 12, 2026',
  },
  {
    id: 'm3',
    title: 'Reply tone',
    content: 'Customer replies should be warm, concise, and less apologetic.',
    type: 'Procedural',
    confidence: 84,
    sensitivity: 'Low',
    source: '3 edited eBay replies',
    learned: 'Jul 7, 2026',
    status: 'Proposed',
  },
  {
    id: 'm4',
    title: 'Preferred work hours',
    content: 'Usually works on shop orders in the morning.',
    type: 'Profile',
    confidence: 64,
    sensitivity: 'Medium',
    source: 'Inferred from two conversations',
    learned: 'Jul 5, 2026',
    status: 'Proposed',
  },
  {
    id: 'm5',
    title: 'Card stock choice',
    content: 'A prior note says matte; a newer message says glossy.',
    type: 'Project',
    confidence: 100,
    sensitivity: 'Low',
    source: 'eBay thank-you cards project',
    learned: 'Jul 9, 2026',
    status: 'Contradiction',
  },
];

export const conversations = [
  {
    id: 'c1',
    title: 'eBay thank-you card direction',
    summary: 'Chose the soft botanical silhouette and reviewed print margins.',
    when: '10 min ago',
    project: 'Thank-you Card Studio',
    cost: '$0.08',
  },
  {
    id: 'c2',
    title: 'Short customer reply',
    summary: 'Drafted a concise response about a delayed shipment.',
    when: 'Yesterday',
    project: 'eBay Shop',
    cost: '$0.03',
  },
  {
    id: 'c3',
    title: 'Weekend reminders',
    summary: 'Created a Saturday inventory reminder.',
    when: 'Mon',
    project: 'Home',
    cost: '$0.02',
  },
];

export const projects = [
  {
    name: 'Thank-you Card Studio',
    goal: 'Prepare a print-ready card collection',
    status: 'Active',
    progress: 72,
    updated: 'Today',
    notes: 12,
    memories: 8,
  },
  {
    name: 'eBay Shop',
    goal: 'Keep customer communication clear and timely',
    status: 'Active',
    progress: 46,
    updated: 'Yesterday',
    notes: 7,
    memories: 13,
  },
  {
    name: 'Garden refresh',
    goal: 'Plan drought-tolerant planting',
    status: 'Paused',
    progress: 20,
    updated: 'Jun 28',
    notes: 4,
    memories: 2,
  },
];

export const skills = [
  {
    name: 'Concise customer reply',
    description: 'Drafts warm, brief replies for common shop questions.',
    scope: 'eBay Shop',
    version: 3,
    status: 'Trusted',
    success: 92,
    previous: 'v2 was more apologetic',
  },
  {
    name: 'Card listing description',
    description: 'Turns card details into scannable marketplace copy.',
    scope: 'Thank-you Card Studio',
    version: 2,
    status: 'Experimental',
    success: 78,
    previous: 'v1 omitted size details',
  },
  {
    name: 'Weekly planning',
    description: 'Creates a realistic plan from priorities and open tasks.',
    scope: 'Everywhere',
    version: 1,
    status: 'Trusted',
    success: 88,
    previous: 'Original version',
  },
];

export const navLabels: Record<Page, string> = {
  chat: 'Chat',
  conversations: 'Conversations',
  profile: 'Your profile',
  memories: 'Memories',
  projects: 'Projects',
  skills: 'Skills',
  schedules: 'Scheduled tasks',
  tools: 'Tools & permissions',
  audit: 'Activity',
  settings: 'Settings',
  backup: 'Backup & restore',
};
