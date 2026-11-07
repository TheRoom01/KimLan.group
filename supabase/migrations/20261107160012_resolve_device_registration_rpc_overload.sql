-- Keep the six-argument implementation for both callers. Its optional
-- device name also supports deployed clients that send five arguments.
drop function public.register_device_session(text, text, text, integer, boolean);

notify pgrst, 'reload schema';
