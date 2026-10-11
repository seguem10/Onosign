-- These trigger-only functions are not RPC endpoints.
-- TRIGGER invocation does not require direct EXECUTE from authenticated clients.
revoke execute on function public.onosign_protect_original_artifact() from public, anon, authenticated;
revoke execute on function public.onosign_validate_signature_field_write() from public, anon, authenticated;
