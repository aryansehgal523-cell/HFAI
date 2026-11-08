/*
 * Where is a job? Country detection from free text locations, tuned for India.
 * Order matters: India is checked first, then other countries and their big cities.
 */

/** The 40 largest Indian job markets, used by aggregator queries and location detection. */
export const INDIAN_CITIES = [
  "Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Gurugram", "Noida", "Kolkata", "Ahmedabad",
  "Jaipur", "Chandigarh", "Kochi", "Coimbatore", "Indore", "Lucknow", "Nagpur", "Thiruvananthapuram", "Vadodara", "Surat",
  "Bhubaneswar", "Visakhapatnam", "Mysuru", "Mangaluru", "Bhopal", "Patna", "Ludhiana", "Nashik", "Rajkot", "Vijayawada",
  "Madurai", "Guwahati", "Dehradun", "Ranchi", "Raipur", "Kanpur", "Goa", "Navi Mumbai", "Thane", "Ghaziabad",
] as const;

const INDIA_WORDS = [
  "india", "bharat", "bangalore", "bengaluru", "mumbai", "bombay", "new delhi", "delhi", "ncr", "hyderabad", "secunderabad", "chennai",
  "madras", "pune", "gurugram", "gurgaon", "noida", "greater noida", "kolkata", "calcutta", "ahmedabad", "jaipur", "chandigarh", "mohali",
  "kochi", "cochin", "coimbatore", "indore", "lucknow", "nagpur", "thiruvananthapuram", "trivandrum", "vadodara", "baroda", "surat",
  "bhubaneswar", "visakhapatnam", "vizag", "mysuru", "mysore", "mangaluru", "mangalore", "bhopal", "patna", "ludhiana", "nashik",
  "rajkot", "vijayawada", "madurai", "guwahati", "dehradun", "ranchi", "raipur", "kanpur", "goa", "panaji", "navi mumbai", "thane",
  "ghaziabad", "faridabad", "manesar", "gandhinagar", "hubli", "belgaum", "belagavi", "tiruchirappalli", "trichy", "salem", "vellore",
  "warangal", "jamshedpur", "aurangabad", "amritsar", "jodhpur", "udaipur", "agra", "varanasi", "allahabad", "prayagraj", "kozhikode",
  "calicut", "thrissur", "pondicherry", "puducherry", "sriperumbudur", "hosur", "kolhapur", "jalandhar", "siliguri", "durgapur",
  "karnataka", "maharashtra", "tamil nadu", "telangana", "andhra pradesh", "kerala", "haryana", "uttar pradesh", "west bengal",
  "gujarat", "rajasthan", "madhya pradesh", "odisha", "punjab", "bihar", "assam", "jharkhand", "chhattisgarh", "uttarakhand",
];

/** Other countries: names, common abbreviations and their biggest job hubs. */
const OTHER_COUNTRIES: [string, string[]][] = [
  ["US", ["united states", "usa", "u.s.", "us", "america", "new york", "nyc", "sf", "sfo", "bay area", "silicon valley", "san francisco", "seattle", "austin", "boston", "chicago", "los angeles", "denver", "atlanta", "dallas", "houston", "miami", "washington", "san jose", "palo alto", "mountain view", "sunnyvale", "menlo park", "redmond", "bellevue", "san diego", "portland", "philadelphia", "pittsburgh", "phoenix", "salt lake city", "raleigh", "charlotte", "detroit", "minneapolis", "nashville", "columbus", "irvine", "santa clara", "cambridge, ma", "california", "texas", "new jersey", "virginia", "massachusetts", "illinois", "colorado", "georgia, us", "north carolina", "florida", "ohio", "michigan", "arizona", "oregon", "utah", "pennsylvania", "minnesota", "tennessee", "maryland", "wisconsin", "indiana", "missouri", "connecticut", "kentucky", "iowa", "nevada", "kansas", "oklahoma", "nebraska", "alabama", "louisiana", "south carolina", "delaware", "idaho", "arkansas", "mississippi", "new hampshire", "vermont", "maine", "hawaii", "alaska", "montana", "wyoming", "rhode island"]],
  ["GB", ["united kingdom", "uk", "u.k.", "england", "scotland", "wales", "northern ireland", "great britain", "london", "manchester", "edinburgh", "birmingham", "bristol", "glasgow", "leeds", "belfast", "reading", "oxford", "cambridge, uk"]],
  ["CA", ["canada", "toronto", "vancouver", "montreal", "ottawa", "calgary", "waterloo", "ontario", "british columbia", "quebec", "alberta"]],
  ["DE", ["germany", "deutschland", "berlin", "munich", "münchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart", "düsseldorf", "dusseldorf"]],
  ["FR", ["france", "paris", "lyon", "toulouse", "marseille"]],
  ["NL", ["netherlands", "amsterdam", "rotterdam", "utrecht", "eindhoven", "the hague"]],
  ["IE", ["ireland", "dublin", "cork", "galway"]],
  ["ES", ["spain", "madrid", "barcelona", "valencia", "málaga", "malaga"]],
  ["PT", ["portugal", "lisbon", "lisboa", "porto"]],
  ["IT", ["italy", "milan", "milano", "rome", "roma", "turin", "torino"]],
  ["CH", ["switzerland", "zurich", "zürich", "geneva", "basel", "lausanne"]],
  ["AT", ["austria", "vienna", "wien", "graz"]],
  ["BE", ["belgium", "brussels", "antwerp"]],
  ["SE", ["sweden", "stockholm", "gothenburg", "malmö", "malmo"]],
  ["NO", ["norway", "oslo"]],
  ["DK", ["denmark", "copenhagen", "aarhus"]],
  ["FI", ["finland", "helsinki", "espoo"]],
  ["PL", ["poland", "warsaw", "warszawa", "kraków", "krakow", "wrocław", "wroclaw", "gdańsk", "gdansk", "poznań", "poznan", "łódź", "lodz"]],
  ["CZ", ["czech", "czechia", "prague", "praha", "brno"]],
  ["RO", ["romania", "bucharest", "cluj", "iasi"]],
  ["HU", ["hungary", "budapest"]],
  ["GR", ["greece", "athens"]],
  ["UA", ["ukraine", "kyiv", "kiev", "lviv"]],
  ["RS", ["serbia", "belgrade"]],
  ["BG", ["bulgaria", "sofia"]],
  ["EE", ["estonia", "tallinn"]],
  ["LT", ["lithuania", "vilnius"]],
  ["LV", ["latvia", "riga"]],
  ["TR", ["turkey", "türkiye", "istanbul", "ankara"]],
  ["IL", ["israel", "tel aviv", "jerusalem", "haifa", "herzliya"]],
  ["AE", ["united arab emirates", "uae", "dubai", "abu dhabi", "sharjah"]],
  ["SA", ["saudi arabia", "riyadh", "jeddah", "dammam"]],
  ["QA", ["qatar", "doha"]],
  ["EG", ["egypt", "cairo"]],
  ["ZA", ["south africa", "johannesburg", "cape town", "durban"]],
  ["NG", ["nigeria", "lagos", "abuja"]],
  ["KE", ["kenya", "nairobi"]],
  ["SG", ["singapore"]],
  ["MY", ["malaysia", "kuala lumpur", "penang"]],
  ["ID", ["indonesia", "jakarta"]],
  ["PH", ["philippines", "manila", "makati", "taguig", "cebu"]],
  ["TH", ["thailand", "bangkok"]],
  ["VN", ["vietnam", "viet nam", "ho chi minh", "hanoi"]],
  ["CN", ["china", "beijing", "shanghai", "shenzhen", "guangzhou", "hangzhou", "suzhou", "chengdu", "wuhan", "dalian", "xi'an"]],
  ["HK", ["hong kong"]],
  ["TW", ["taiwan", "taipei", "hsinchu"]],
  ["JP", ["japan", "tokyo", "osaka", "kyoto", "yokohama"]],
  ["KR", ["south korea", "korea", "seoul"]],
  ["AU", ["australia", "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra"]],
  ["NZ", ["new zealand", "auckland", "wellington"]],
  ["BR", ["brazil", "brasil", "são paulo", "sao paulo", "rio de janeiro", "belo horizonte", "curitiba", "porto alegre", "florianópolis", "blumenau", "campinas"]],
  ["MX", ["mexico", "méxico", "mexico city", "guadalajara", "monterrey"]],
  ["AR", ["argentina", "buenos aires"]],
  ["CO", ["colombia", "bogotá", "bogota", "medellín", "medellin"]],
  ["CL", ["chile", "santiago"]],
  ["PE", ["peru", "lima"]],
  ["CR", ["costa rica", "san josé"]],
  ["PK", ["pakistan", "karachi", "lahore", "islamabad"]],
  ["BD", ["bangladesh", "dhaka"]],
  ["LK", ["sri lanka", "colombo"]],
  ["NP", ["nepal", "kathmandu"]],
  ["LU", ["luxembourg"]],
  ["HR", ["croatia", "zagreb"]],
  ["SK", ["slovakia", "bratislava"]],
  ["SI", ["slovenia", "ljubljana"]],
  ["CY", ["cyprus", "limassol", "nicosia"]],
  ["MT", ["malta", "valletta"]],
  ["IS", ["iceland", "reykjavik"]],
  ["BA", ["bosnia", "sarajevo"]],
  ["MK", ["north macedonia", "skopje"]],
  ["AL", ["albania", "tirana"]],
  ["MD", ["moldova", "chisinau"]],
  ["BY", ["belarus", "minsk"]],
  ["RU", ["russia", "moscow", "saint petersburg"]],
  ["AM", ["armenia", "yerevan"]],
  ["AZ", ["azerbaijan", "baku"]],
  ["KZ", ["kazakhstan", "almaty", "astana"]],
  ["JO", ["jordan", "amman"]],
  ["LB", ["lebanon", "beirut"]],
  ["KW", ["kuwait"]],
  ["BH", ["bahrain", "manama"]],
  ["OM", ["oman", "muscat"]],
  ["MA", ["morocco", "casablanca", "rabat"]],
  ["TN", ["tunisia", "tunis"]],
  ["GH", ["ghana", "accra"]],
  ["UG", ["uganda", "kampala"]],
  ["RW", ["rwanda", "kigali"]],
  ["TZ", ["tanzania", "dar es salaam"]],
  ["ET", ["ethiopia", "addis ababa"]],
  ["UY", ["uruguay", "montevideo"]],
  ["EC", ["ecuador", "quito"]],
  ["VE", ["venezuela", "caracas"]],
  ["GT", ["guatemala"]],
  ["PA", ["panama"]],
  ["DO", ["dominican republic", "santo domingo"]],
  ["JM", ["jamaica", "kingston"]],
  ["PR", ["puerto rico", "san juan"]],
  ["KH", ["cambodia", "phnom penh"]],
  ["MM", ["myanmar", "yangon"]],
  ["MO", ["macau", "macao"]],
];

/**
 * Regions that clearly exclude India ("AMER", "EMEA", "Remote - Europe"). These have no single country,
 * so the job's country stays empty, but the job is outside an India crawl. APAC and Asia are kept.
 */
const FOREIGN_REGIONS = ["amer", "americas", "north america", "noram", "namer", "latam", "latin america", "south america", "emea", "europe", "eu", "dach", "nordics", "benelux", "uk&i", "ukie", "anz", "oceania", "mena", "middle east", "africa", "sea", "southeast asia", "south east asia", "cee"];

/** ISO codes we accept as country hints from structured data (addressCountry, countryCode...). */
const COUNTRY_NAME_TO_CODE = new Map<string, string>(
  [["india", "IN"], ...OTHER_COUNTRIES.map(([code, words]) => [words[0], code] as [string, string])],
);

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const wordRe = (words: string[]) => new RegExp(`(?:^|[^a-z])(?:${words.map(escape).join("|")})(?:$|[^a-z])`, "i");

const INDIA_RE = wordRe(INDIA_WORDS);
// "Fremont, CA" or "Rochester, MN 55901". "IN" is left out: ", IN" means India as often as Indiana.
const US_STATE_RE =
  /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(?:\s+\d{5})?\s*(?:$|[,;)|])/;
const OTHER_RES: [string, RegExp][] = OTHER_COUNTRIES.map(([code, words]) => [code, wordRe(words)]);

/**
 * Two letter country code for a free text location, or null when unknown.
 * "Bengaluru, Karnataka" → IN, "Remote - US" → US, "Taiwan, Taipei" → TW, "Remote" → null.
 * When a location names India and other countries ("Bengaluru; London"), India wins.
 */
export function detectCountry(location: string): string | null {
  const loc = ` ${location.toLowerCase()} `;
  if (INDIA_RE.test(loc)) return "IN";
  if (US_STATE_RE.test(location)) return "US";
  // Short tokens like "us" and "uk" only count as whole words (not inside "campus" or "duke").
  for (const [code, re] of OTHER_RES) if (re.test(loc)) return code;
  return null;
}

/** Map a structured country value ("IN", "IND", "India") to a two letter code. */
export function countryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  if (/^ind$/i.test(v)) return "IN";
  if (/^usa$/i.test(v)) return "US";
  return COUNTRY_NAME_TO_CODE.get(v.toLowerCase()) ?? detectCountry(v);
}

/**
 * Crawl scope. "india" (the default) keeps jobs in India plus jobs whose country we can't tell
 * (typically "Remote" or "Multiple locations"). Jobs clearly located in another country are skipped,
 * which keeps the database focused on what our users can apply for. "all" keeps everything.
 */
export function inCrawlScope(country: string | null, scope = process.env.CRAWL_SCOPE ?? "india"): boolean {
  if (scope === "all") return true;
  return country === null || country === "IN";
}

const FOREIGN_REGION_RE = wordRe(FOREIGN_REGIONS);

/** A location naming only regions outside India ("AMER", "Remote, EMEA") and no Indian place. */
export function isForeignRegion(location: string): boolean {
  return FOREIGN_REGION_RE.test(location) && !INDIA_RE.test(` ${location.toLowerCase()} `);
}

/** Should a job with this country and location be stored? (Country decides; regions break ties when it is unknown.) */
export function jobInScope(country: string | null, location: string, scope = process.env.CRAWL_SCOPE ?? "india"): boolean {
  if (!inCrawlScope(country, scope)) return false;
  return scope === "all" || country === "IN" || !isForeignRegion(location);
}

/** Quick check on a listing line before paying for a detail request. */
export function locationLooksInScope(location: string, scope = process.env.CRAWL_SCOPE ?? "india"): boolean {
  return jobInScope(detectCountry(location), location, scope);
}
