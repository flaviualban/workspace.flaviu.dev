import { Network, MailCheck, FolderSync, ShieldCheck, Activity, CalendarClock } from "lucide-react";

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
    status: "Ready",
    icon: ShieldCheck,
    route: "/tools/ssl",
    description:
      "Inspectează expirarea certificatelor SSL, statusul OCSP stapling și benchmark-uri handshake HTTP/2.",
  },
  {
    id: "uptime-monitor",
    testId: "tool-card-uptime-monitor",
    title: "Uptime Monitor",
    romanianTitle: "Uptime & Response Monitor",
    category: "Availability",
    status: "Ready",
    icon: Activity,
    route: "/tools/uptime",
    description:
      "Verificare HTTP(S) automată în fundal, la fiecare 5 minute, cu istoric, timp de răspuns și alertă vizuală la cădere.",
  },
  {
    id: "whois-expiry",
    testId: "tool-card-whois-expiry",
    title: "WHOIS / Domain Expiry",
    romanianTitle: "Expirare domenii & registrar",
    category: "Domain Registry",
    status: "Ready",
    icon: CalendarClock,
    route: "/tools/whois",
    description:
      "Data de expirare a domeniului, registrarul și nameserverele, cu alertă vizuală când expirarea se apropie.",
  },
];
