-- Event-specific upload slots imported from Untitled spreadsheet.xlsx.

insert into public.clubs (name, slug, short_name, description)
values ('IEEE CS', 'ieee-cs', 'IEEE CS', 'IEEE Computer Society club.')
on conflict (slug) do update
set
  name = excluded.name,
  short_name = excluded.short_name,
  description = excluded.description,
  updated_at = now();

create table if not exists public.event_slots (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  event_number integer not null,
  event_name text not null,
  event_tier text not null default 'minor',
  required_media_type public.billboard_type not null default 'poster',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_slots_event_tier_check check (event_tier in ('major', 'minor')),
  constraint event_slots_unique_club_event unique (club_id, event_number, event_name)
);

alter table public.event_slots enable row level security;

drop policy if exists "Public reads active event slots" on public.event_slots;
create policy "Public reads active event slots"
on public.event_slots for select
to anon, authenticated
using (active = true or public.is_super_admin() or public.is_club_admin_for(club_id) or public.is_event_ops());

drop policy if exists "Super admins manage event slots" on public.event_slots;
create policy "Super admins manage event slots"
on public.event_slots for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

alter table public.billboards
  add column if not exists event_slot_id uuid references public.event_slots(id) on delete set null,
  add column if not exists event_name text,
  add column if not exists event_tier text;

alter table public.billboards
  drop constraint if exists billboards_event_tier_check;

alter table public.billboards
  add constraint billboards_event_tier_check
  check (event_tier is null or event_tier in ('major', 'minor'));

create index if not exists event_slots_club_idx on public.event_slots (club_id, event_tier, event_number);
create index if not exists billboards_event_slot_idx on public.billboards (event_slot_id);

with imported(club_name, club_slug, event_number, event_name, event_tier, required_media_type) as (
values
  ('Accelerate', 'accelerate', 1, 'All Systems Go', 'minor', 'poster'),
  ('AIML COMMUNITY', 'aiml-community', 1, 'AI ESCAPE ROOM', 'minor', 'poster'),
  ('Aperture muj', 'aperture', 1, 'Lenscape 2.0', 'minor', 'poster'),
  ('Aperture muj', 'aperture', 2, 'CUTAWAY 2.0', 'minor', 'poster'),
  ('CACTUS – The Fashion & Perception Club', 'cactus-fashion-perception', 1, 'Retrograde', 'minor', 'poster'),
  ('Cinefilia-The Dramatics and Filmmaking Club of MUJ', 'cinefilia', 1, 'Comicon', 'minor', 'poster'),
  ('COSMOS - The Science Club', 'cosmos-science-club', 1, 'Echoes of the Cosmos', 'minor', 'poster'),
  ('COSMOS - The Science Club', 'cosmos-science-club', 2, 'Zerohour', 'minor', 'poster'),
  ('cyber space club', 'cyber-space-club', 1, 'Cyber Quest', 'minor', 'poster'),
  ('Data Science', 'data-science', 1, 'DataThon', 'minor', 'poster'),
  ('De Artistry Club', 'd-artistry', 1, 'Art Alchemy', 'minor', 'poster'),
  ('Dept of Electrical Engineering', 'dept-electrical-engineering', 1, 'Design Circuit for General Applications', 'minor', 'poster'),
  ('Dept of Mechatronics X IEI', 'dept-mechatronics-x-iei', 1, 'RoboMonopoly (RPL)', 'minor', 'poster'),
  ('Dept of Mechatronics X IEI', 'dept-mechatronics-x-iei', 2, 'Fusion Workshop and Competiton 2.0', 'minor', 'poster'),
  ('Earth Club', 'earth-club', 1, 'Case Study', 'minor', 'poster'),
  ('eis', 'eis', 1, 'ideathon', 'minor', 'poster'),
  ('Enactus', 'enactus', 1, '“FOUNDERS’ FORGE”', 'minor', 'poster'),
  ('Entrepreneur and Innovation Society', 'entrepreneur-innovation-society', 1, 'Startupforge', 'minor', 'poster'),
  ('fashion dept x d club', 'fashion-dept-x-d-club', 1, 'tbd', 'minor', 'poster'),
  ('fashion dept x d club', 'fashion-dept-x-d-club', 2, 'tbd', 'minor', 'poster'),
  ('fashion dept x d club', 'fashion-dept-x-d-club', 3, 'tbd', 'minor', 'poster'),
  ('Finance Club', 'finance-club', 1, 'Fintech Wars', 'minor', 'poster'),
  ('Garuda Club', 'garuda', 1, 'Sufi Night', 'major', 'video'),
  ('GLITCH! Esports Society', 'glitch-esports-society', 1, 'Respawn', 'major', 'video'),
  ('GNF', 'gnf', 1, 'Gamezone', 'minor', 'poster'),
  ('GNF', 'gnf', 2, 'Level Zero-where Idea Begins', 'minor', 'poster'),
  ('GNF (Centaurus Arena Club)', 'gnf-centaurus-arena-club', 1, 'Level Zero-where Idea Begins', 'minor', 'poster'),
  ('Gram Asha', 'gram-asha', 1, 'Crisis 24', 'minor', 'poster'),
  ('Green horizon', 'green-horizon', 1, 'International Client Counselling Competition', 'minor', 'poster'),
  ('Her Campus at MUJ', 'her-campus-at-muj', 1, 'Esc The Expected', 'minor', 'poster'),
  ('Her Campus at MUJ', 'her-campus-at-muj', 2, 'ctrl freak', 'minor', 'poster'),
  ('Hotel Management Dept X Epicurean', 'hotel-management-dept-x-epicurean', 1, 'MUJ Hospitech 2026', 'minor', 'poster'),
  ('IEEE CIS', 'ieee-cis', 1, 'Dead Air', 'minor', 'poster'),
  ('IEEE CIS', 'ieee-cis', 2, 'Code of the Seas', 'minor', 'poster'),
  ('IEEE MTT-S, IEEE APS and IEEE AESS', 'ieee-mtt-s-aps-aess', 1, 'Project Expo 5.0', 'major', 'video'),
  ('IEEE RAS SBC', 'ieee-ras', 1, 'Micromouse', 'major', 'video'),
  ('IEEE SB MUJ', 'ieee-sb', 1, 'EvolX', 'major', 'video'),
  ('IEEE SB MUJ', 'ieee-sb', 2, 'Mayday', 'minor', 'poster'),
  ('IEEE WIE MUJ', 'ieee-wie', 1, 'TECHRACE', 'minor', 'poster'),
  ('IEEE WIE MUJ', 'ieee-wie', 2, 'BradIT 3.0', 'minor', 'poster'),
  ('IEI Civil Engineering', 'iei-civil-engineering', 1, 'FLOOD READY ASSAM', 'minor', 'poster'),
  ('IEI MECHATRONICS STUDENTS'' CHAPTER', 'iei-mechatronics-students-chapter', 1, 'RC Arena', 'minor', 'poster'),
  ('IEI MECHATRONICS STUDENTS'' CHAPTER', 'iei-mechatronics-students-chapter', 2, 'Beyond Human', 'major', 'video'),
  ('IEI Student Chapter', 'iei-student-chapter', 1, 'Save The Egg', 'minor', 'poster'),
  ('internantional relation club', 'international-relation-club', 1, 'British Parliament 2.0', 'minor', 'poster'),
  ('ISA MUJ Chapter', 'isa-muj-chapter', 1, 'Nothing SUS', 'minor', 'poster'),
  ('LAW', 'law', 1, 'NATIONAL LEGAL HACKATHON', 'minor', 'poster'),
  ('LearnIT MUJ', 'learnit-muj', 1, 'Cyber Escape Room', 'minor', 'poster'),
  ('litmus', 'litmus', 1, 'Prompt Engineering', 'minor', 'poster'),
  ('Managia', 'managia', 1, 'TechTics', 'minor', 'poster'),
  ('MarkSoc', 'marksoc', 1, 'CaseX', 'minor', 'poster'),
  ('MASDC', 'masdc', 1, 'Breaking Point', 'minor', 'poster'),
  ('mind over matter', 'mind-over-matter', 1, 'Brainwave', 'minor', 'poster'),
  ('MUJ ACM SIGAI Student Chapter', 'muj-acm-sigai-student-chapter', 1, 'Model Wars', 'major', 'video'),
  ('MUJ ACM SIGBED Student Chapter', 'muj-acm-sigbed-student-chapter', 1, 'Robo Wars', 'major', 'video'),
  ('MUJ ACM STUDENT CHAPTER', 'acm', 1, 'Charlie and the Chocolate Factory:  Digital Mayhem', 'minor', 'poster'),
  ('MUJ ACM Student Chapter x MUJ ACM SIGAI', 'muj-acm-x-sigai', 1, 'Breachpoint', 'minor', 'poster'),
  ('Nexus', 'nexus', 1, 'Coded Chaos', 'minor', 'poster'),
  ('Nexus', 'nexus', 2, 'Tech Mystery', 'minor', 'poster'),
  ('olympism', 'olympism', 1, 'techathlon', 'minor', 'poster'),
  ('Omphalos', 'omphalos', 1, 'MUJ Model', 'minor', 'poster'),
  ('Pitchers Craft', 'pitchers-craft', 1, 'AI Summit', 'major', 'video'),
  ('Pitchers Craft x EIS', 'pitchers-craft-x-eis', 1, 'The Unscripted', 'minor', 'poster'),
  ('Randomize();', 'randomize', 1, 'ML Workshop', 'minor', 'poster'),
  ('RPM', 'rpm', 1, 'Soapbox Derby', 'minor', 'poster'),
  ('Scribbles', 'scribbles', 1, 'Shapeit', 'minor', 'poster'),
  ('SHABD chapter 2026-2027', 'shabd-chapter-2026-2027', 1, 'JAM', 'minor', 'poster'),
  ('The Cypher Club', 'the-cypher-club', 1, 'Techverse-beyond Earth', 'minor', 'poster'),
  ('TMC', 'tmc', 1, 'SYMPHONY', 'minor', 'poster'),
  ('IEEE CS', 'ieee-cs', 1, 'Venom 2.0', 'major', 'video')
)
insert into public.event_slots (club_id, event_number, event_name, event_tier, required_media_type, active)
select c.id, imported.event_number, imported.event_name, imported.event_tier, imported.required_media_type::public.billboard_type, true
from imported
join public.clubs c
  on c.slug = imported.club_slug
  or lower(c.name) = lower(imported.club_name)
on conflict (club_id, event_number, event_name) do update
set
  event_tier = excluded.event_tier,
  required_media_type = excluded.required_media_type,
  active = true,
  updated_at = now();

