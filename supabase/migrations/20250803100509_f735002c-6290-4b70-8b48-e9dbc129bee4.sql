-- First add a unique constraint to fabric_types if it doesn't exist
ALTER TABLE public.fabric_types 
ADD CONSTRAINT fabric_types_name_tenant_unique UNIQUE (name, tenant_id);

-- Insert fabric types from the provided list
INSERT INTO public.fabric_types (name, description) VALUES
('T233', 'Vải T233'),
('T200 trơn', 'Vải T200 trơn'),
('T250 trơn', 'Vải T250 trơn'),
('T250 sọc', 'Vải T250 sọc'),
('T300 ô vuông 5f', 'Vải T300 ô vuông 5f'),
('T260', 'Vải T260'),
('T300 trơn', 'Vải T300 trơn'),
('T300 100% trơn', 'Vải T300 100% trơn'),
('T300 sọc vải cũ', 'Vải T300 sọc vải cũ'),
('T300 sọc', 'Vải T300 sọc'),
('T300 sọc 0,5', 'Vải T300 sọc 0,5'),
('T300 Lông vũ', 'Vải T300 Lông vũ'),
('T300 ô vuông', 'Vải T300 ô vuông'),
('T400 trơn', 'Vải T400 trơn'),
('T600', 'Vải T600'),
('lth xanh than', 'Vải lth xanh than'),
('lth sọc be', 'Vải lth sọc be'),
('lth xanh dương', 'Vải lth xanh dương'),
('lth sọc xanh ngọc', 'Vải lth sọc xanh ngọc'),
('lth sọc ghi đậm', 'Vải lth sọc ghi đậm'),
('lth xanh đậm', 'Vải lth xanh đậm'),
('lth cát cháy', 'Vải lth cát cháy'),
('lth đỏ', 'Vải lth đỏ'),
('lth tím', 'Vải lth tím'),
('lth nâu', 'Vải lth nâu'),
('lth xanh lá', 'Vải lth xanh lá'),
('lth ghi nhờ', 'Vải lth ghi nhờ'),
('lth trắng sọc', 'Vải lth trắng sọc'),
('chống thấm chần', 'Vải chống thấm chần'),
('ct mỏng trắng', 'Vải ct mỏng trắng'),
('ct ghi', 'Vải ct ghi'),
('110g trắng', 'Vải 110g trắng'),
('110g kem', 'Vải 110g kem'),
('tencel micro', 'Vải tencel micro'),
('120g trắng', 'Vải 120g trắng')
ON CONFLICT (name, tenant_id) DO NOTHING;