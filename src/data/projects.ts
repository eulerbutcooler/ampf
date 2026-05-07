export interface Project {
  index: string;
  title: string;
  description: string;
  stack: string[];
  github?: string;
  live?: string;
  year: string;
  tag: string;
  featured?: boolean;
}

export const projects: Project[] = [
  {
    index: "01",
    title: "Hermes",
    description: "Automation platform built in Go with a DAG based UI",
    stack: ["TypeScript", "React", "Go", "Cloudflare"],
    github: "https://github.com/eulerbutcooler/hermes",
    year: "2026",
    tag: "Fullstack",
    featured: true,
  },
  {
    index: "02",
    title: "AeroMentor",
    description: "RAG based fullstack app. Made for a client.",
    stack: ["Go", "PostgreSQL", "Redis", "RAG", "Python"],
    github: "https://github.com/eulerbutcooler/wingman-backend",
    year: "2026",
    tag: "Fullstack",
    featured: true,
  },
  {
    index:'03',
    title: "WikiSillyGoose",
    description: "A travel roulette that brings up interesting places to visit wherever you click on the globe",
    stack: ["NextJS","ThreeJS","Gemini API"],
    github: "https://github.com/eulerbutcooler/wikisillygoose",
    live: "https://wikisillygoose.eulerbutcooler.tech/",
    year:"2026",
    tag: "Fullstack",
    featured: true,
  },
  {
    index: "04",
    title: "HTTP from Scratch",
    description: "Implemented a fully functional HTTP/1.1 server from raw TCP sockets",
    stack: ["Go", "TCP", "HTTP/1.1"],
    github: "https://github.com/eulerbutcooler/http-from-scratch",
    year: "2026",
    tag: "Backend",
    featured: false,
  },
];
