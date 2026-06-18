-- ============================================================
-- Schema Orchidea Web Platform
-- Applicato automaticamente da PostgreSQL al primo avvio
-- ============================================================

-- Utenti registrati (clienti)
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    cognome     VARCHAR(100) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    telefono    VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    confermato  BOOLEAN NOT NULL DEFAULT FALSE,
    token_conferma VARCHAR(255),
    token_conferma_scadenza TIMESTAMP,
    password_reset_token    VARCHAR(255),
    password_reset_scadenza TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Amministratori (separati dagli utenti)
CREATE TABLE IF NOT EXISTS admins (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Planimetrie (layout del locale)
CREATE TABLE IF NOT EXISTS layouts (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Posti/Tavoli su una planimetria
CREATE TABLE IF NOT EXISTS seats (
    id          SERIAL PRIMARY KEY,
    layout_id   INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
    tipo        VARCHAR(20) NOT NULL
                  CHECK (tipo IN ('tavolo_tondo', 'poltroncina_3', 'posto_singolo')),
    pos_x       INTEGER NOT NULL,
    pos_y       INTEGER NOT NULL,
    capienza    INTEGER NOT NULL DEFAULT 1,
    etichetta   VARCHAR(20) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Serate/Events
CREATE TABLE IF NOT EXISTS events (
    id                   SERIAL PRIMARY KEY,
    titolo               VARCHAR(255) NOT NULL,
    data_evento          TIMESTAMP NOT NULL,
    descrizione          TEXT,
    layout_id            INTEGER REFERENCES layouts(id) ON DELETE SET NULL,
    costo_acconto        DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_posti_per_utente INTEGER NOT NULL DEFAULT 10,
    prenotazioni_aperte  BOOLEAN NOT NULL DEFAULT FALSE,
    pubblicato           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Prenotazioni
CREATE TABLE IF NOT EXISTS bookings (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    seat_ids         INTEGER[] NOT NULL,
    stato            VARCHAR(20) NOT NULL DEFAULT 'temporanea'
                       CHECK (stato IN ('temporanea', 'in_attesa', 'confermata', 'annullata')),
    importo          DECIMAL(10,2) NOT NULL,
    payment_provider VARCHAR(10) CHECK (payment_provider IN ('stripe', 'paypal')),
    payment_id       VARCHAR(255),
    scadenza_timer   TIMESTAMP,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Profili DJ
CREATE TABLE IF NOT EXISTS dj_profiles (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    bio         TEXT,
    foto_path   VARCHAR(500),
    ordine      INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Galleria fotografica
CREATE TABLE IF NOT EXISTS gallery (
    id          SERIAL PRIMARY KEY,
    event_id    INTEGER REFERENCES events(id) ON DELETE SET NULL,
    foto_path   VARCHAR(500) NOT NULL,
    didascalia  VARCHAR(255),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- News
CREATE TABLE IF NOT EXISTS news (
    id          SERIAL PRIMARY KEY,
    titolo      VARCHAR(255) NOT NULL,
    contenuto   TEXT NOT NULL,
    pubblicata  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Storico invii newsletter
CREATE TABLE IF NOT EXISTS newsletter_sends (
    id           SERIAL PRIMARY KEY,
    oggetto      VARCHAR(255) NOT NULL,
    corpo        TEXT NOT NULL,
    destinatari  INTEGER NOT NULL DEFAULT 0,
    inviata_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Iscritti newsletter pubblici
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id                SERIAL PRIMARY KEY,
    email             VARCHAR(255) UNIQUE NOT NULL,
    nome              VARCHAR(100),
    unsubscribe_token VARCHAR(255) UNIQUE,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indici per performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_event   ON bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user    ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_stato   ON bookings(stato);
CREATE INDEX IF NOT EXISTS idx_bookings_timer   ON bookings(scadenza_timer)
    WHERE stato = 'temporanea';
CREATE INDEX IF NOT EXISTS idx_seats_layout     ON seats(layout_id);
CREATE INDEX IF NOT EXISTS idx_events_data      ON events(data_evento);
