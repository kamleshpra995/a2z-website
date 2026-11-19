/** Everything the public website says, in one place. Edit here, not in the components. */
import type { IconName } from './icons.tsx';

export const business = {
  name: 'A2Z Power Solution',
  tagline: 'Commercial Refrigeration & HVAC Services',
  phone: '+917000010205',
  phoneDisplay: '+91 70000 10205',
  email: 'info@a2zpowersolution.in',
  address: 'P-205, SG Grand, Raj Nagar Extension, Ghaziabad, UP 201017',
  gstin: '09ABUFA6623N1ZO',
  udyam: 'UDYAM-UP-29-0018661',
  /** Service Desk login for customers, store managers and A2Z staff. */
  portal: '/portal/',
  whatsapp: 'https://wa.me/917000010205?text=Hi%2C%20I%20need%20refrigeration%2FAC%20service.',
};

export interface ServiceCard {
  title: string;
  description: string;
  image: string;
  alt: string;
  icon: IconName;
}

const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=60`;

export const refrigeration: ServiceCard[] = [
  {
    title: 'Ice Machine',
    description: 'Repair & servicing of all commercial ice makers and cube machines.',
    image: photo('photo-1578323851363-cf6a1a6afbb6'),
    alt: 'Stacked clear ice cubes',
    icon: 'iceMachine',
  },
  {
    title: 'Deep Freezer',
    description: 'All brands of chest and upright deep freezers, gas charging & parts.',
    image: photo('photo-1601599967100-f16100982063'),
    alt: 'Commercial freezer case with food items',
    icon: 'freezer',
  },
  {
    title: 'Under Counter Freezer',
    description: 'Compact under-counter units for restaurant & café kitchens.',
    image: photo('photo-1589109807644-924edf14ee09'),
    alt: 'Stainless steel commercial kitchen',
    icon: 'underCounter',
  },
  {
    title: 'Makeline',
    description: 'Prep-table & makeline refrigeration for QSR and cloud kitchens.',
    image: photo('photo-1622021142947-da7dedc7c39a'),
    alt: 'Chef preparing food on a prep counter',
    icon: 'makeline',
  },
  {
    title: 'Chiller',
    description: 'Water & glycol chillers — breakdown repair and preventive service.',
    image: photo('photo-1559569283-327b99858782'),
    alt: 'Industrial cooling equipment',
    icon: 'chiller',
  },
  {
    title: 'Visi Cooler',
    description: 'Display coolers & visi coolers for retail and beverage storage.',
    image: photo('photo-1601599561096-f87c95fff1e9'),
    alt: 'Beverage display coolers in a store',
    icon: 'visiCooler',
  },
  {
    title: 'Cold Room',
    description: 'Walk-in cold rooms — installation, panels, condensing units & AMC.',
    image: photo('photo-1662320154145-7263e998e7a2'),
    alt: 'Cold storage room with metal walls',
    icon: 'coldRoom',
  },
];

export const airConditioning: ServiceCard[] = [
  {
    title: 'AC Repair & Service',
    description: 'Split, cassette & window AC — repair, gas charging, deep service.',
    image: photo('photo-1757219525975-03b5984bc6e8'),
    alt: 'Wall-mounted air conditioner',
    icon: 'airConditioner',
  },
  {
    title: 'AHU',
    description: 'Air handling units — coil cleaning, motors, belts & maintenance.',
    image: photo('photo-1769006708689-afe6f69b4f76'),
    alt: 'Large industrial air handling fan',
    icon: 'ahu',
  },
  {
    title: 'VRF Systems',
    description: 'Variable refrigerant flow systems — service & fault rectification.',
    image: photo('photo-1698479603408-1a66a6d9e80f'),
    alt: 'Row of outdoor VRF condenser units',
    icon: 'network',
  },
  {
    title: 'VRV Systems',
    description: 'VRV multi-split systems for offices, hotels & retail spaces.',
    image: photo('photo-1700124113583-81aa99ea2aa2'),
    alt: 'Outdoor AC unit on a building',
    icon: 'network',
  },
  {
    title: 'Ductable AC',
    description: 'Ductable & packaged units — ducting, servicing and repairs.',
    image: photo('photo-1615309662243-70f6df917b59'),
    alt: 'Metal air conditioning ductwork',
    icon: 'duct',
  },
  {
    title: 'Cooling Systems',
    description: 'End-to-end cooling system maintenance & annual contracts (AMC).',
    image: photo('photo-1667983453881-4992fe86ab1b'),
    alt: 'Multiple air conditioning units on a wall',
    icon: 'coolingSystem',
  },
];

export interface ClientBrand {
  name: string;
  detail: string;
  domain: string;
}

export const clients: ClientBrand[] = [
  { name: 'Blue Tokai', detail: 'Coffee Roasters', domain: 'bluetokaicoffee.com' },
  { name: 'Chinese Wok', detail: 'Lenexis Foodworks', domain: 'thechinesewok.com' },
  { name: 'Blinkit', detail: 'Quick Commerce', domain: 'blinkit.com' },
  { name: 'Burma Burma', detail: 'Restaurants', domain: 'burmaburma.in' },
  { name: 'Stanza Living', detail: 'Managed Accommodation', domain: 'stanzaliving.com' },
];

export const reasons: { title: string; description: string; icon: IconName }[] = [
  {
    title: 'Fast Response',
    description:
      'Quick turnaround on breakdown calls — because downtime costs your business money.',
    icon: 'bolt',
  },
  {
    title: 'Registered Business',
    description:
      'GST & MSME (Udyam) registered partnership firm — proper billing for your accounts.',
    icon: 'shield',
  },
  {
    title: 'All Brands, All Equipment',
    description:
      'One vendor for every cooling asset — refrigeration, HVAC and AC across all major brands.',
    icon: 'building',
  },
  {
    title: 'AMC & Preventive Care',
    description: 'Annual maintenance contracts that catch problems before they become breakdowns.',
    icon: 'headset',
  },
];
