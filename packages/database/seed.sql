-- Clinic CRM seed data
-- Patients demo data

INSERT INTO patients (
  full_name,
  phone,
  birth_date,
  gender,
  patient_source,
  notes
)
VALUES
  (
    'Иванов Иван Иванович',
    '+7 (900) 123-45-67',
    '1985-03-12',
    'male',
    'Рекомендации',
    'Постоянный пациент, контроль артериального давления.'
  ),
  (
    'Петрова Анна Сергеевна',
    '+7 (900) 234-56-78',
    '1990-07-25',
    'female',
    'Реклама',
    'Первичный визит, жалобы на сердцебиение.'
  ),
  (
    'Сидоров Максим Петрович',
    '+7 (900) 345-67-89',
    '1978-11-03',
    'male',
    'Сайт',
    'Плановое обследование, контроль лабораторных показателей.'
  ),
  (
    'Смирнова Ольга Андреевна',
    '+7 (900) 456-78-90',
    '1995-02-18',
    'female',
    'Соцсети',
    'Повторный прием после курса лечения.'
  );

INSERT INTO doctors (
  full_name,
  specialty,
  percent,
  active
)
VALUES
  ('Иван Иванов', 'Терапевт', 50, true),
  ('Анна Петрова', 'Кардиолог', 50, true)
ON CONFLICT DO NOTHING;

INSERT INTO services (
  code,
  name,
  price
)
VALUES
  ('CONS-THER', 'Консультация терапевта', 1800),
  ('LAB-CBC', 'Анализ крови (общий)', 950)
ON CONFLICT DO NOTHING;

