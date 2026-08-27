-- Read-only reporting aggregates. These functions reduce egress by doing
-- sums/counts in Postgres instead of downloading every order to the browser.
-- They are intentionally SECURITY INVOKER so existing RLS remains enforced.

CREATE OR REPLACE FUNCTION public.get_dashboard_revenue(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(o.total_amount), 0)::numeric
  FROM public.orders AS o
  WHERE o.status IN ('delivered', 'self_delivered')
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at < p_to);
$$;

CREATE OR REPLACE FUNCTION public.get_order_stats(p_manager_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      o.id,
      o.status,
      o.total_amount,
      o.created_at,
      o.delivery_date,
      COALESCE((
        SELECT SUM(op.payment_amount)
        FROM public.order_payments AS op
        WHERE op.order_id = o.id
      ), 0)::numeric AS total_paid
    FROM public.orders AS o
    WHERE p_manager_id IS NULL
       OR p_manager_id = 'all'
       OR o.manager_id::text = p_manager_id
  )
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pending_count', COUNT(*) FILTER (WHERE status = 'pending'),
    'processing_count', COUNT(*) FILTER (WHERE status = 'processing'),
    'completed_count', COUNT(*) FILTER (WHERE status IN ('delivered', 'self_delivered')),
    'overdue_count', COUNT(*) FILTER (
      WHERE status NOT IN ('delivered', 'self_delivered', 'shipped', 'cancelled', 'returned')
        AND COALESCE(delivery_date, created_at + interval '6 days') < now()
    ),
    'total_receivable', COALESCE(SUM(
      CASE WHEN status NOT IN ('cancelled', 'returned')
        THEN GREATEST(COALESCE(total_amount, 0) - total_paid, 0)
        ELSE 0
      END
    ), 0)::numeric,
    'total_value', COALESCE(SUM(
      CASE WHEN status IN ('delivered', 'self_delivered')
        THEN COALESCE(total_amount, 0)
        ELSE 0
      END
    ), 0)::numeric
  )
  FROM scoped;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_revenue(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_order_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_revenue(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_stats(text) TO authenticated;
