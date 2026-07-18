/* Fake data for the Sentinel access-control console. */
const SENTINEL_DATA = {
  events: [
    { id: "FZ-2C09", name: "Helena Braga",   role: "Diretoria",        gate: "Portão Principal", time: "09:41:07", conf: 99.2, status: "granted" },
    { id: "FZ-2C08", name: "Rafael Lemos",    role: "Engenharia",       gate: "Laboratório 2",    time: "09:38:55", conf: 98.7, status: "granted" },
    { id: "FZ-2C07", name: "Desconhecido",    role: "Não cadastrado",   gate: "Doca de Carga",    time: "09:36:12", conf: 41.3, status: "denied"  },
    { id: "FZ-2C06", name: "Iris Nunes",      role: "Segurança",        gate: "Portão Principal", time: "09:34:48", conf: 99.5, status: "granted" },
    { id: "FZ-2C05", name: "Marcos API",      role: "Visitante",        gate: "Recepção",         time: "09:31:20", conf: 95.1, status: "review"  },
    { id: "FZ-2C04", name: "Tânia Vasquez",   role: "Financeiro",       gate: "Andar 4",          time: "09:29:03", conf: 99.0, status: "granted" },
    { id: "FZ-2C03", name: "Bruno Carvalho",  role: "Engenharia",       gate: "Laboratório 1",    time: "09:25:41", conf: 98.2, status: "granted" },
  ],
  identities: [
    { name: "Helena Braga",    role: "Diretoria",   dept: "Executivo",  clearance: "Total",    status: "online",  enrolled: "12/03/2024" },
    { name: "Rafael Lemos",    role: "Engenharia",  dept: "Plataforma", clearance: "Elevado",  status: "online",  enrolled: "04/05/2024" },
    { name: "Iris Nunes",      role: "Segurança",   dept: "Operações",  clearance: "Elevado",  status: "online",  enrolled: "21/01/2024" },
    { name: "Tânia Vasquez",   role: "Financeiro",  dept: "Corporativo",clearance: "Padrão",   status: "away",    enrolled: "08/07/2024" },
    { name: "Bruno Carvalho",  role: "Engenharia",  dept: "Plataforma", clearance: "Padrão",   status: "offline", enrolled: "15/09/2024" },
    { name: "Camila Rocha",    role: "Produto",     dept: "Corporativo",clearance: "Padrão",   status: "online",  enrolled: "02/02/2025" },
    { name: "Diego Antunes",   role: "Infra",       dept: "Operações",  clearance: "Elevado",  status: "offline", enrolled: "19/11/2024" },
    { name: "Letícia Moraes",  role: "Jurídico",    dept: "Corporativo",clearance: "Padrão",   status: "away",    enrolled: "27/06/2024" },
  ],
  stats: [
    { label: "Acessos hoje",        value: "1.284", delta: "+8,2%", tone: "neutral" },
    { label: "Taxa de autorização", value: "97,4%", delta: "+0,6%", tone: "success" },
    { label: "Tempo médio",         value: "284ms", delta: "−12ms", tone: "neutral" },
    { label: "Tentativas negadas",  value: "33",    delta: "+5",    tone: "warning" },
  ],
};
window.SENTINEL_DATA = SENTINEL_DATA;
