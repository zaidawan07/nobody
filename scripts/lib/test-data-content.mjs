// Content lists for the EstateOS test-data seed.
//
// Everything here is our own hand-written list -- no faker-generated names,
// no faker-generated phone numbers, and nothing that points at a real person
// or a real subscriber. Phone numbers live in a reserved test-only block that
// is not allocated to any Pakistani operator subscriber, so they can never
// belong to anyone: +92 300 000 0001 .. +92 300 000 9999.
//
// The geography columns follow the `locations` hierarchy seeded by migration
// 0005, so a seeded property lines up with the city/division/district rows the
// app's location pickers read.

/** Cities served by the seeded agencies, with the 0005 hierarchy columns. */
export const CITIES = [
  {
    city: "Lahore",
    province: "Punjab",
    division: "Lahore Division",
    district: "Lahore",
    tehsil: "Lahore",
    lat: 31.5204,
    lng: 74.3587,
    societies: [
      "DHA Lahore",
      "Bahria Town Lahore",
      "Model Town",
      "Johar Town",
      "Gulberg",
      "Askari",
      "Wapda Town",
      "Lake City",
    ],
    localities: ["Block A", "Block H", "Block J", "Sector C", "Sector G", "Township"],
  },
  {
    city: "Karachi",
    province: "Sindh",
    division: "Karachi Division",
    district: "Karachi",
    tehsil: "Karachi",
    lat: 24.8607,
    lng: 67.0011,
    societies: [
      "DHA Karachi",
      "Bahria Town Karachi",
      "Clifton",
      "Gulshan-e-Iqbal",
      "North Nazimabad",
      "PECHS",
      "Scheme 33",
      "Gulistan-e-Johar",
    ],
    localities: ["Block 6", "Block 13", "Sector 15-B", "Buffer Zone", "KDA Scheme 1"],
  },
  {
    city: "Islamabad",
    province: "Islamabad Capital Territory",
    division: "Islamabad",
    district: "Islamabad",
    tehsil: "Islamabad",
    lat: 33.6844,
    lng: 73.0479,
    societies: [
      "Bahria Enclave",
      "DHA Islamabad",
      "Gulberg Greens",
      "Bahria Town Islamabad",
      "F-11 Markaz",
      "I-8",
    ],
    localities: ["F-10", "F-11", "G-13", "I-8", "E-11", "Margalla Town"],
  },
  {
    city: "Rawalpindi",
    province: "Punjab",
    division: "Rawalpindi Division",
    district: "Rawalpindi",
    tehsil: "Rawalpindi",
    lat: 33.5651,
    lng: 73.0169,
    societies: [
      "Bahria Town Rawalpindi",
      "Chaklala Scheme",
      "Satellite Town",
      "Askari",
      "Gulraiz",
      "Media Town",
    ],
    localities: ["Phase 1", "Phase 4", "Phase 8", "Chaklala Scheme 3", "Peshawar Road"],
  },
  {
    city: "Faisalabad",
    province: "Punjab",
    division: "Faisalabad Division",
    district: "Faisalabad",
    tehsil: "Faisalabad",
    lat: 31.418,
    lng: 73.079,
    societies: ["Madina Town", "Peoples Colony", "Eden Valley", "Wapda City", "Samanabad"],
    localities: ["Madina Town Block A", "Peoples Colony No. 1", "Canal Road", "Jhang Road"],
  },
  {
    city: "Peshawar",
    province: "Khyber Pakhtunkhwa",
    division: "Peshawar Division",
    district: "Peshawar",
    tehsil: "Peshawar",
    lat: 34.0151,
    lng: 71.5249,
    societies: ["Hayatabad", "University Town", "Regi Model Town", "Army Burn Hall", "Gulbahar"],
    localities: ["Phase 1", "Phase 3", "Phase 6", "University Road", "Ring Road"],
  },
];

export const MALE_NAMES = [
  "Ahmed",
  "Ali",
  "Usman",
  "Hamza",
  "Bilal",
  "Imran",
  "Salman",
  "Faisal",
  "Tariq",
  "Zain",
  "Kamran",
  "Saad",
  "Waqas",
  "Yasir",
  "Zeeshan",
  "Asad",
  "Junaid",
  "Noman",
  "Rizwan",
  "Shahid",
  "Adnan",
  "Farhan",
  "Hassan",
  "Hussain",
  "Maaz",
  "Mudassir",
  "Omar",
  "Sohaib",
  "Umair",
  "Zubair",
];

export const FEMALE_NAMES = [
  "Ayesha",
  "Fatima",
  "Sana",
  "Hina",
  "Rabia",
  "Nadia",
  "Zainab",
  "Maryam",
  "Nimra",
  "Laiba",
  "Iqra",
  "Sadaf",
  "Mehwish",
  "Kiran",
  "Amna",
  "Bushra",
  "Farah",
  "Hafsa",
  "Javeria",
  "Komal",
  "Maham",
  "Noor",
  "Rida",
  "Sadia",
  "Sidra",
  "Sumaira",
  "Uzma",
  "Zoya",
  "Anum",
  "Erum",
];

export const SURNAMES = [
  "Khan",
  "Malik",
  "Butt",
  "Chaudhry",
  "Sheikh",
  "Qureshi",
  "Siddiqui",
  "Bhatti",
  "Abbasi",
  "Mirza",
  "Raza",
  "Baig",
  "Awan",
  "Gondal",
  "Durrani",
  "Farooqi",
  "Hashmi",
  "Javed",
  "Mahmood",
  "Nawaz",
  "Rehman",
  "Saeed",
  "Shah",
  "Tariq",
  "Usmani",
  "Yousaf",
  "Zafar",
  "Anwar",
  "Aslam",
  "Iqbal",
];

/** Property types that are actually in migration 0000's property_type enum. */
export const PROPERTY_TYPES = [
  "house",
  "apartment",
  "plot",
  "commercial",
  "office",
  "shop",
  "warehouse",
  "agricultural",
];

export const PROPERTY_TYPE_LABELS = {
  house: "House",
  apartment: "Apartment",
  plot: "Residential Plot",
  commercial: "Commercial Plaza",
  office: "Office",
  shop: "Shop",
  warehouse: "Warehouse",
  agricultural: "Agricultural Land",
};

/** Colour/quality words used only in prose (description / features text). */
export const FEATURES = [
  "Corner plot",
  "Park facing",
  "Wide road access",
  "Gas connection available",
  "Boundary wall",
  "Covered parking",
  "Solar panels",
  "Backup generator point",
  "Servant quarter",
  "Lawn",
  "Study room",
  "Drawing room",
  "Elevator",
  "24/7 security",
  "Community mosque nearby",
  "School within 2 km",
];

/**
 * Test-only mobile block. `+92 300 000 0001` style numbers are not issued to
 * subscribers by any Pakistani operator, so they cannot be a real person's
 * number. One counter feeds every phone number in the seed.
 */
export const TEST_MOBILE_PREFIX = "+92300000";

export function fakeMobile(counter) {
  return `${TEST_MOBILE_PREFIX}${String(counter).padStart(4, "0")}`;
}

/** Handy for owners/tenants/realtors on a property record. */
export function fakePersonName(rng) {
  const first = rng.helpers.arrayElement([...MALE_NAMES, ...FEMALE_NAMES]);
  const last = rng.helpers.arrayElement(SURNAMES);
  return `${first} ${last}`;
}
