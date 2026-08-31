import { Network, MailCheck, FolderSync, ShieldCheck, Database, TerminalSquare } from "lucide-react";

export const TOOLS = [
  {
    id: "dns-zone-lookup",
    testId: "tool-card-dns-lookup",
    title: "DNS Zone Lookup",
    romanianTitle: "Interogare zonă DNS",
    category: "Network & Domain",
    status: "Ready",
    icon: Network,
    route: "/tools/dns",
    description:
      "Interoghează live înregistrările zonei DNS (A, AAAA, MX, CNAME, TXT, NS, SOA) pentru orice domeniu, cu parsare TTL.",
  },
  {
    id: "imap-mail-sync",
    testId: "tool-card-imap-sync",
    title: "IMAP Mail Sync",
    romanianTitle: "Transfer mailuri între 2 adrese IMAP",
    category: "Email Migration",
    status: "Ready",
    icon: MailCheck,
    route: "/tools/imap",
    description:
      "Sincronizează căsuțele poștale între două conturi IMAP, cu mapare foldere, comparație delta și log de progres.",
  },
  {
    id: "cpanel-file-migration",
    testId: "tool-card-cpanel-migrator",
    title: "cPanel File Migration",
    romanianTitle: "Migrare fișiere între cPanel-uri",
    category: "Server Migration",
    status: "Ready",
    icon: FolderSync,
    route: "/tools/cpanel",
    description:
      "Migrare automată a public_html, bazelor de date MySQL și fișierelor de configurare între două instanțe cPanel.",
  },
  {
    id: "ssl-cert-renew",
    testId: "tool-card-ssl-monitor",
    title: "SSL & Domain Health",
    romanianTitle: "Monitorizare SSL & Domenii",
    category: "Security",
    status: "Soon",
    icon: ShieldCheck,
    description:
      "Inspectează expirarea certificatelor SSL, statusul OCSP stapling și benchmark-uri handshake HTTP/2.",
  },
  {
    id: "database-dumper",
    testId: "tool-card-database-dumper",
    title: "DB Dump & Restore",
    romanianTitle: "Export & Import Baze de Date",
    category: "Database Utility",
    status: "Soon",
    icon: Database,
    description:
      "Generare dump comprimat cu un click, restaurare pe server remote și comparație structură tabele.",
  },
  {
    id: "custom-script-runner",
    testId: "tool-card-custom-script",
    title: "Script Executor",
    romanianTitle: "Rulare Scripturi Personalizate",
    category: "Automation",
    status: "Soon",
    icon: TerminalSquare,
    description:
      "Configurează și rulează scripturi Bash/Python de automatizare direct din workspace, cu output live.",
  },
];
