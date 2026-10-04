-- Posters have no size cap in the admin panel any more (only videos are capped, at 7 MB).
-- Raise the event-posters bucket from 10 MB to 50 MB, the most Supabase's free plan allows per file.
update storage.buckets
set file_size_limit = 52428800
where id in ('event-posters', 'billboard-media');
