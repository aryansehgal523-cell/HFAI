import type { ResumeData } from "@/db/schema";

// A compact skills vocabulary used for keyword extraction and ATS scoring.
// Extend freely; matching is case insensitive and whole word.
export const SKILL_VOCAB = [
  "python", "java", "javascript", "typescript", "go", "golang", "rust", "c++", "c#", "kotlin", "swift", "scala", "ruby", "php", "sql",
  "react", "next.js", "node.js", "express", "django", "flask", "fastapi", "spring", "spring boot", "angular", "vue", "tailwind", "graphql", "rest",
  "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ci/cd", "jenkins", "github actions", "linux", "microservices", "kafka", "redis",
  "postgresql", "mysql", "mongodb", "elasticsearch", "snowflake", "bigquery", "spark", "pyspark", "hadoop", "airflow", "dbt", "etl",
  "machine learning", "deep learning", "pytorch", "tensorflow", "scikit-learn", "nlp", "computer vision", "llm", "rag", "langchain",
  "langgraph", "genai", "generative ai", "prompt engineering", "mlops", "data analysis", "statistics", "pandas", "numpy", "tableau",
  "power bi", "excel", "a/b testing", "figma", "product management", "agile", "scrum", "jira", "sales", "crm", "salesforce",
  "communication", "stakeholder management", "system design", "data structures", "algorithms", "security", "devops", "android", "ios",
  "flutter", "react native",
];

const PRETTY: Record<string, string> = {
  aws: "AWS", gcp: "GCP", sql: "SQL", llm: "LLM", rag: "RAG", nlp: "NLP", etl: "ETL", mlops: "MLOps", genai: "GenAI",
  "ci/cd": "CI/CD", "c++": "C++", "c#": "C#", fastapi: "FastAPI", "next.js": "Next.js", "node.js": "Node.js",
  postgresql: "PostgreSQL", mysql: "MySQL", mongodb: "MongoDB", pyspark: "PySpark", pytorch: "PyTorch",
  tensorflow: "TensorFlow", "scikit-learn": "scikit-learn", langchain: "LangChain", langgraph: "LangGraph",
  graphql: "GraphQL", javascript: "JavaScript", typescript: "TypeScript", dbt: "dbt", "power bi": "Power BI",
  "a/b testing": "A/B testing", crm: "CRM", ios: "iOS", "github actions": "GitHub Actions", bigquery: "BigQuery",
  "react native": "React Native", "spring boot": "Spring Boot", rest: "REST", "computer vision": "Computer vision",
};

/** Display name for a skill keyword ("aws" → "AWS", "machine learning" → "Machine learning"). */
export function prettySkill(s: string) {
  const k = s.toLowerCase();
  return PRETTY[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
}

const escape =(s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function extractKeywords(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  return SKILL_VOCAB.filter((k) => new RegExp(`(^|[^a-z0-9])${escape(k)}([^a-z0-9]|$)`).test(lower));
}

export function resumeToText(r: ResumeData | null | undefined): string {
  if (!r) return "";
  return [
    r.headline, r.summary,
    ...r.experience.flatMap((e) => [e.title, e.company, ...e.bullets]),
    ...r.projects.flatMap((p) => [p.name, ...(p.tech ?? []), ...p.bullets]),
    ...r.skills.flatMap((s) => s.items),
    ...r.achievements,
  ].filter(Boolean).join("\n");
}

/** Share of the job's keywords that appear in the resume, 0 to 100. */
export function atsScore(resumeText: string, jobText: string, jobSkills: string[] = []) {
  const wanted = Array.from(new Set([...extractKeywords(jobText), ...jobSkills.map((s) => s.toLowerCase())]));
  if (wanted.length === 0) return { score: 100, matched: [], missing: [] as string[] };
  const have = new Set(extractKeywords(resumeText));
  const lowerResume = resumeText.toLowerCase();
  const matched = wanted.filter((k) => have.has(k) || lowerResume.includes(k));
  const missing = wanted.filter((k) => !matched.includes(k));
  return { score: Math.round((matched.length / wanted.length) * 100), matched, missing };
}
