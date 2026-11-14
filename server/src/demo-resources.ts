import type { ResourceType } from './models/Resource.js';

export interface DemoResource {
  name: string;
  type: ResourceType;
  location: string;
  capacity: number | null;
  description: string;
  tags: string[];
}

/**
 * The demo catalog `npm run seed` creates (PLAN.md §11, M2): rooms and individual equipment items,
 * including projectors. It is real data in the database, called demo data in the README (DESIGN.md §9).
 */
export const DEMO_RESOURCES: DemoResource[] = [
  {
    name: 'Boardroom',
    type: 'room',
    location: 'Block A, 3rd floor',
    capacity: 12,
    description: 'The largest meeting room, with a wall display and a conference phone.',
    tags: ['Projector', 'Whiteboard', 'Video conferencing', 'Speakerphone', 'Step-free access'],
  },
  {
    name: 'Focus Room',
    type: 'room',
    location: 'Block A, 2nd floor',
    capacity: 2,
    description: 'A quiet room for calls and one-to-ones.',
    tags: ['Quiet'],
  },
  {
    name: 'Huddle 1',
    type: 'room',
    location: 'Block A, 1st floor',
    capacity: 4,
    description: 'A small room for quick team syncs.',
    tags: ['Whiteboard'],
  },
  {
    name: 'Huddle 2',
    type: 'room',
    location: 'Block B, 1st floor',
    capacity: 4,
    description: 'A small room with a display screen for sharing work.',
    tags: ['Display screen'],
  },
  {
    name: 'Training Room',
    type: 'room',
    location: 'Block B, 2nd floor',
    capacity: 20,
    description: 'A classroom layout for workshops and onboarding.',
    tags: ['Projector', 'Whiteboard', 'Microphone'],
  },
  {
    name: 'Projector 1',
    type: 'equipment',
    location: 'IT desk, Block A ground floor',
    capacity: null,
    description: 'A portable HD projector with HDMI and USB-C inputs.',
    tags: ['Projector', 'HDMI', 'Portable'],
  },
  {
    name: 'Projector 2',
    type: 'equipment',
    location: 'IT desk, Block A ground floor',
    capacity: null,
    description: 'A portable HD projector with HDMI and USB-C inputs.',
    tags: ['Projector', 'HDMI', 'Portable'],
  },
  {
    name: 'Conference speakerphone',
    type: 'equipment',
    location: 'IT desk, Block A ground floor',
    capacity: null,
    description: 'A USB speakerphone for calls in small rooms.',
    tags: ['Audio', 'USB'],
  },
];
