ALTER TABLE consultations ADD COLUMN pet_sex TEXT;
ALTER TABLE consultations ADD COLUMN pet_spayed_neutered INTEGER DEFAULT 0;
ALTER TABLE consultations ADD COLUMN pet_color TEXT;
