-- Delete duplicate order_payments (keep oldest per order)
DELETE FROM public.order_payments WHERE id IN (
  '4496e239-7783-44b7-9068-8cef799814b3',
  'e2f2e969-7c33-464d-8594-ffb9ca808f3f',
  '543711c7-e1e0-4e3c-9bf0-76ceebfbccab',
  '3792be22-9bb8-473f-a51a-5e9e039eb32e',
  'ef407e61-1248-455b-a456-08f39ad4dd9f',
  '081190f0-bfa1-48b4-b840-6f675940aa21'
);

-- Delete corresponding duplicate transactions
DELETE FROM public.transactions WHERE id IN (
  '818210bc-5868-4763-9514-e5f48450e700',
  'b0278d5a-8995-4147-b9dd-12af38dad633',
  'b2a4e105-06e0-412a-8e87-b490f19a0a68',
  '94d3ee75-aef3-41ac-a1fc-8fc35be03220',
  'aab76205-31c3-4c43-be16-e9c8e5d37ebc',
  'cb0a63af-5d8a-457e-9dde-b7a1b9ed4879'
);