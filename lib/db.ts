import { Pool } from 'pg';

// Połączenie z bazą PostgreSQL (Neon)
// Priorytet: DATABASE_URL (Neon) > POSTGRES_URL > POSTGRES_PRISMA_URL > PRISMA_DATABASE_URL
const getConnectionString = () => {
  // Neon używa standardowo DATABASE_URL
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  if (process.env.POSTGRES_URL) {
    return process.env.POSTGRES_URL;
  }
  if (process.env.POSTGRES_PRISMA_URL) {
    return process.env.POSTGRES_PRISMA_URL;
  }
  if (process.env.PRISMA_DATABASE_URL) {
    // Usuń prefix prisma+ jeśli istnieje
    return process.env.PRISMA_DATABASE_URL.replace(/^prisma\+/, '');
  }
  throw new Error('No PostgreSQL connection string found in environment variables');
};

const pool = new Pool({
  connectionString: getConnectionString(),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Flagi migracji - zapamiętują, czy kolumny zostały już usunięte
let isFormerUserColumnRemoved = false;
let isFormerStudentColumnRemoved = false;

// Helper do wykonywania zapytań SQL
const sql = (strings: TemplateStringsArray, ...values: any[]) => {
  let query = strings[0];
  for (let i = 0; i < values.length; i++) {
    query += `$${i + 1}`;
    query += strings[i + 1];
  }
  return pool.query(query, values);
};

// Typy
export type AccountType = 'user' | 'admin' | 'lektor';
export type Location = 'Paniówki' | 'Halemba' | 'Orzegów' | 'Kochłowice' | 'Bielszowice';

export interface User {
  id: string; // Format: 0001, 0002, etc.
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  account_type: AccountType;
  confirmed: boolean;
  reset_token?: string | null;
  reset_token_expiry?: Date | null;
  active?: boolean;
  resignation_date?: Date | null;
  created_at: Date;
  last_login?: Date | null;
}

export interface Student {
  student_id: string; // Format: 0001-01, 0001-02, etc.
  user_id: string; // FK do users.id
  first_name: string;
  last_name: string;
  birth_year: string;
  location: Location;
  active: boolean;
  resignation_requested: boolean;
  resignation_reason?: string | null;
  resignation_date?: Date | null;
  created_at?: Date;
}

// ====================================
// INICJALIZACJA BAZY DANYCH
// ====================================

/**
 * Tworzy sekwencję dla ID użytkowników (format 0001, 0002...)
 */
async function ensureUserSequenceExists(): Promise<void> {
  try {
    await sql`
      CREATE SEQUENCE IF NOT EXISTS user_id_seq START 1;
    `;
  } catch (error) {
    console.error('Error creating user_id sequence:', error);
    throw error;
  }
}

/**
 * Generuje nowe ID użytkownika w formacie 0001, 0002...
 */
async function generateUserId(): Promise<string> {
  try {
    await ensureUserSequenceExists();
    
    const result = await sql`
      SELECT LPAD(nextval('user_id_seq')::TEXT, 4, '0') as user_id;
    `;
    
    return result.rows[0].user_id;
  } catch (error) {
    console.error('Error generating user ID:', error);
    throw error;
  }
}

/**
 * Tworzy tabelę users jeśli nie istnieje
 */
async function ensureUsersTableExists(): Promise<void> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        account_type VARCHAR(20) DEFAULT 'user' NOT NULL,
        confirmed BOOLEAN DEFAULT FALSE NOT NULL,
        reset_token VARCHAR(255),
        reset_token_expiry TIMESTAMP,
        active BOOLEAN DEFAULT TRUE NOT NULL,
        resignation_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        CONSTRAINT valid_account_type CHECK (account_type IN ('user', 'admin', 'lektor'))
      );
    `;
    
    // Dodaj kolumny jeśli nie istnieją (dla istniejących tabel)
    try {
      await sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;
      `;
    } catch (error) {
      console.log('Column active may already exist');
    }
    
    try {
      await sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS resignation_date TIMESTAMP;
      `;
    } catch (error) {
      console.log('Column resignation_date may already exist');
    }
    
    // Usuń kolumnę is_former_user jeśli istnieje (migracja - tylko raz)
    if (!isFormerUserColumnRemoved) {
      try {
        const columnExists = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'is_former_user'
        `;
        
        if (columnExists.rows.length > 0) {
          await sql`
            ALTER TABLE users 
            DROP COLUMN is_former_user;
          `;
          console.log('✅ Removed is_former_user column from users table');
        }
        isFormerUserColumnRemoved = true;
      } catch (error) {
        // Ignoruj błąd - kolumna może już nie istnieć
        isFormerUserColumnRemoved = true;
      }
    }
    
    // Indeksy dla szybszego wyszukiwania
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);
    `;
    
    console.log('✅ Users table ready');
  } catch (error) {
    console.error('Error ensuring users table exists:', error);
    throw error;
  }
}

/**
 * Tworzy tabelę students jeśli nie istnieje
 */
async function ensureStudentsTableExists(): Promise<void> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS students (
        student_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        birth_year VARCHAR(4) NOT NULL,
        location VARCHAR(50) NOT NULL,
        active BOOLEAN DEFAULT FALSE NOT NULL,
        resignation_requested BOOLEAN DEFAULT FALSE NOT NULL,
        resignation_reason TEXT,
        resignation_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT valid_location CHECK (location IN ('Paniówki', 'Halemba', 'Orzegów', 'Kochłowice', 'Bielszowice'))
      );
    `;
    
    // Indeks dla szybszego wyszukiwania
    await sql`
      CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_students_location ON students(location);
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
    `;
    
    // Migracja: dodaj kolumny rezygnacji jeśli nie istnieją
    try {
      await sql`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS resignation_requested BOOLEAN DEFAULT FALSE NOT NULL;
      `;
    } catch (error) {
      // Kolumna może już istnieć, ignoruj błąd
      console.log('Column resignation_requested may already exist');
    }
    
    try {
      await sql`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS resignation_reason TEXT;
      `;
    } catch (error) {
      // Kolumna może już istnieć, ignoruj błąd
      console.log('Column resignation_reason may already exist');
    }
    
    try {
      await sql`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS resignation_date TIMESTAMP;
      `;
    } catch (error) {
      // Kolumna może już istnieć, ignoruj błąd
      console.log('Column resignation_date may already exist');
    }
    
    // Usuń kolumnę is_former_student jeśli istnieje (migracja - tylko raz)
    if (!isFormerStudentColumnRemoved) {
      try {
        const columnExists = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'students' AND column_name = 'is_former_student'
        `;
        
        if (columnExists.rows.length > 0) {
          await sql`
            ALTER TABLE students 
            DROP COLUMN is_former_student;
          `;
          console.log('✅ Removed is_former_student column from students table');
        }
        isFormerStudentColumnRemoved = true;
      } catch (error) {
        // Ignoruj błąd - kolumna może już nie istnieć
        isFormerStudentColumnRemoved = true;
      }
    }
    
    console.log('✅ Students table ready');
  } catch (error) {
    console.error('Error ensuring students table exists:', error);
    throw error;
  }
}

/**
 * Inicjalizuje wszystkie tabele
 */
async function ensureTablesExist(): Promise<void> {
  await ensureUsersTableExists();
  await ensureStudentsTableExists();
  await ensureUserSequenceExists();
}

// ====================================
// FUNKCJE DO ZARZĄDZANIA UŻYTKOWNIKAMI
// ====================================

/**
 * Pobiera użytkownika po email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT * FROM users 
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching user by email:', error);
    throw error;
  }
}

/**
 * Pobiera użytkownika po ID
 */
export async function getUserById(id: string): Promise<User | null> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT * FROM users 
      WHERE id = ${id}
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching user by ID:', error);
    throw error;
  }
}

/**
 * Tworzy nowego użytkownika (domyślnie z typem 'user')
 */
export async function createUser(data: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  accountType?: AccountType; // Opcjonalne, domyślnie 'user'
}): Promise<User> {
  try {
    await ensureTablesExist();
    
    // Generuj ID w formacie 0001, 0002...
    const userId = await generateUserId();
    
    const result = await sql`
      INSERT INTO users (
        id,
        email, 
        password_hash, 
        first_name, 
        last_name,
        account_type,
        confirmed
      )
      VALUES (
        ${userId},
        ${data.email.toLowerCase()},
        ${data.passwordHash},
        ${data.firstName},
        ${data.lastName},
        ${data.accountType || 'user'},
        FALSE
      )
      RETURNING *
    `;
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Generuje ID ucznia w formacie user_id-001, user_id-002...
 */
async function generateStudentId(userId: string): Promise<string> {
  try {
    // Pobierz wszystkie student_id dla danego użytkownika
    const studentsResult = await sql`
      SELECT student_id FROM students WHERE user_id = ${userId}
    `;
    
    let maxNumber = 0;
    
    // Przejdź przez wszystkie ID i znajdź najwyższy numer
    for (const row of studentsResult.rows) {
      const studentId = row.student_id;
      // Wyciągnij numer z końcówki ID (format: userId-XX)
      const parts = studentId.split('-');
      if (parts.length === 2) {
        const number = parseInt(parts[1], 10);
        if (!isNaN(number) && number > maxNumber) {
          maxNumber = number;
        }
      }
    }
    
    // Następny numer to maxNumber + 1
    const nextNumber = maxNumber + 1;
    const studentId = `${userId}-${String(nextNumber).padStart(2, '0')}`;
    
    return studentId;
  } catch (error) {
    console.error('Error generating student ID:', error);
    throw error;
  }
}

/**
 * Tworzy ucznia (studenta)
 */
export async function createStudent(data: {
  userId: string;
  firstName: string;
  lastName: string;
  birthYear: string;
  location: Location;
}): Promise<Student> {
  try {
    await ensureTablesExist();
    
    // Generuj student_id w formacie user_id-01, user_id-02...
    const studentId = await generateStudentId(data.userId);
    
    const result = await sql`
      INSERT INTO students (
        student_id,
        user_id,
        first_name,
        last_name,
        birth_year,
        location,
        active
      )
      VALUES (
        ${studentId},
        ${data.userId},
        ${data.firstName},
        ${data.lastName},
        ${data.birthYear},
        ${data.location},
        FALSE
      )
      RETURNING *
    `;
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating student:', error);
    throw error;
  }
}

/**
 * Pobiera wszystkich uczniów dla danego użytkownika
 */
export async function getStudentsByUserId(userId: string): Promise<Student[]> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT * FROM students 
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `;
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching students by user ID:', error);
    throw error;
  }
}

/**
 * Pobiera studenta po ID
 */
export async function getStudentById(studentId: string): Promise<Student | null> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT * FROM students 
      WHERE student_id = ${studentId}
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching student by ID:', error);
    throw error;
  }
}

/**
 * Aktualizuje datę ostatniego logowania
 */
export async function updateLastLogin(userId: string): Promise<void> {
  try {
    await ensureTablesExist();
    
    await sql`
      UPDATE users 
      SET last_login = CURRENT_TIMESTAMP 
      WHERE id = ${userId}
    `;
  } catch (error) {
    console.error('Error updating last login:', error);
    throw error;
  }
}

/**
 * Ustawia token resetowania hasła
 */
export async function setResetToken(
  email: string, 
  token: string, 
  expiry: Date
): Promise<void> {
  try {
    await ensureTablesExist();
    
    await sql`
      UPDATE users 
      SET 
        reset_token = ${token},
        reset_token_expiry = ${expiry.toISOString()}
      WHERE LOWER(email) = LOWER(${email})
    `;
  } catch (error) {
    console.error('Error setting reset token:', error);
    throw error;
  }
}

/**
 * Pobiera użytkownika po tokenie resetowania
 */
export async function getUserByResetToken(token: string): Promise<User | null> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT * FROM users 
      WHERE reset_token = ${token}
      AND reset_token_expiry > CURRENT_TIMESTAMP
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching user by reset token:', error);
    throw error;
  }
}

/**
 * Resetuje hasło użytkownika i usuwa token
 */
export async function resetPassword(
  token: string, 
  newPasswordHash: string
): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      UPDATE users 
      SET 
        password_hash = ${newPasswordHash},
        reset_token = NULL,
        reset_token_expiry = NULL
      WHERE reset_token = ${token}
      AND reset_token_expiry > CURRENT_TIMESTAMP
      RETURNING id
    `;
    
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error resetting password:', error);
    throw error;
  }
}

/**
 * Sprawdza czy email już istnieje w bazie
 */
export async function emailExists(email: string): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT COUNT(*) as count FROM users 
      WHERE LOWER(email) = LOWER(${email})
    `;
    
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error('Error checking email existence:', error);
    throw error;
  }
}

// ====================================
// FUNKCJE DLA ADMINISTRACJI I LEKTORÓW
// ====================================

/**
 * Zmienia typ konta użytkownika (TYLKO DLA ADMINÓW)
 * Używaj tej funkcji aby nadać komuś uprawnienia admin lub lektor
 */
export async function updateAccountType(
  userId: string,
  newAccountType: AccountType
): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      UPDATE users 
      SET account_type = ${newAccountType}
      WHERE id = ${userId}
      RETURNING id
    `;
    
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error updating account type:', error);
    throw error;
  }
}

/**
 * Zmienia typ konta użytkownika po emailu (TYLKO DLA ADMINÓW)
 */
export async function updateAccountTypeByEmail(
  email: string,
  newAccountType: AccountType
): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      UPDATE users 
      SET account_type = ${newAccountType}
      WHERE LOWER(email) = LOWER(${email})
      RETURNING id
    `;
    
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error updating account type by email:', error);
    throw error;
  }
}

/**
 * Pobiera wszystkich użytkowników (dla adminów)
 */
export async function getAllUsers(): Promise<User[]> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT * FROM users 
      ORDER BY created_at DESC
    `;
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching all users:', error);
    throw error;
  }
}

/**
 * Pobiera użytkowników według typu konta
 */
export async function getUsersByAccountType(accountType: AccountType): Promise<User[]> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT * FROM users 
      WHERE account_type = ${accountType}
      ORDER BY created_at DESC
    `;
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching users by account type:', error);
    throw error;
  }
}

/**
 * Sprawdza czy użytkownik jest adminem
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT account_type FROM users 
      WHERE id = ${userId}
      LIMIT 1
    `;
    
    return result.rows[0]?.account_type === 'admin';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Sprawdza czy użytkownik jest lektorem
 */
export async function isLektor(userId: string): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT account_type FROM users 
      WHERE id = ${userId}
      LIMIT 1
    `;
    
    return result.rows[0]?.account_type === 'lektor';
  } catch (error) {
    console.error('Error checking lektor status:', error);
    return false;
  }
}

/**
 * Sprawdza czy użytkownik ma uprawnienia (admin lub lektor)
 */
export async function hasElevatedPermissions(userId: string): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT account_type FROM users 
      WHERE id = ${userId}
      LIMIT 1
    `;
    
    const accountType = result.rows[0]?.account_type;
    return accountType === 'admin' || accountType === 'lektor';
  } catch (error) {
    console.error('Error checking permissions:', error);
    return false;
  }
}

// ====================================
// FUNKCJE POMOCNICZE
// ====================================

/**
 * Testuje połączenie z bazą danych
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

/**
 * Sprawdza czy tabela users istnieje
 */
export async function checkUsersTableExists(): Promise<boolean> {
  try {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      );
    `;
    return result.rows[0].exists;
  } catch (error) {
    console.error('Error checking users table:', error);
    return false;
  }
}

// ====================================
// FUNKCJE ADMINISTRACYJNE
// ====================================

/**
 * Aktualizuje dane użytkownika (TYLKO DLA ADMINÓW)
 */
export async function updateUser(
  userId: string,
  data: {
    first_name?: string;
    last_name?: string;
    email?: string;
    account_type?: AccountType;
    confirmed?: boolean;
  }
): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.first_name !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(data.first_name);
    }
    if (data.last_name !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(data.last_name);
    }
    if (data.email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(data.email.toLowerCase());
    }
    if (data.account_type !== undefined) {
      updates.push(`account_type = $${paramCount++}`);
      values.push(data.account_type);
    }
    if (data.confirmed !== undefined) {
      updates.push(`confirmed = $${paramCount++}`);
      values.push(data.confirmed);
    }

    if (updates.length === 0) {
      return false;
    }

    values.push(userId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id`;
    
    const result = await pool.query(query, values);
    
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

/**
 * Usuwa użytkownika (TYLKO DLA ADMINÓW)
 * Uwaga: automatycznie usuwa związanych studentów przez CASCADE
 */
export async function deleteUser(userId: string): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    // Sprawdź czy kolumny istnieją, jeśli nie - dodaj je
    try {
      await sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;
      `;
    } catch (error) {
      console.log('Column active may already exist');
    }
    
    try {
      await sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS resignation_date TIMESTAMP;
      `;
    } catch (error) {
      console.log('Column resignation_date may already exist');
    }
    
    // Oznacz użytkownika jako nieaktywnego (active = FALSE)
    const result = await sql`
      UPDATE users 
      SET 
        active = FALSE,
        resignation_date = NOW()
      WHERE id = ${userId}
      RETURNING id
    `;
    
    if ((result.rowCount ?? 0) === 0) {
      return false;
    }
    
    // Oznacz wszystkich dzieci użytkownika jako nieaktywnych uczniów (active = FALSE)
    await sql`
      UPDATE students 
      SET 
        resignation_date = NOW(),
        active = FALSE
      WHERE user_id = ${userId}
    `;
    
    console.log(`Marked user ${userId} as inactive and all their students as inactive`);
    return true;
  } catch (error) {
    console.error('Error marking user as inactive:', error);
    throw error;
  }
}

/**
 * Przywraca byłego użytkownika (oznacza jako aktywnego)
 */
export async function restoreUser(userId: string): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    // Przywróć tylko użytkownika - dzieci NIE są automatycznie przywracane
    const result = await sql`
      UPDATE users 
      SET 
        active = TRUE,
        resignation_date = NULL
      WHERE id = ${userId}
      RETURNING id
    `;
    
    console.log(`Restored user ${userId} (children are not automatically restored)`);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error restoring user:', error);
    throw error;
  }
}

/**
 * Pobiera wszystkich studentów
 */
export async function getAllStudents(): Promise<Student[]> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT * FROM students 
      ORDER BY created_at DESC
    `;
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching all students:', error);
    throw error;
  }
}

/**
 * Aktualizuje dane studenta (TYLKO DLA ADMINÓW)
 */
export async function updateStudent(
  studentId: string,
  data: {
    first_name?: string;
    last_name?: string;
    birth_year?: string;
    location?: Location;
    active?: boolean;
    resignation_requested?: boolean;
    resignation_reason?: string | null;
    resignation_date?: Date | null;
  }
): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.first_name !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(data.first_name);
    }
    if (data.last_name !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(data.last_name);
    }
    if (data.birth_year !== undefined) {
      updates.push(`birth_year = $${paramCount++}`);
      values.push(data.birth_year);
    }
    if (data.location !== undefined) {
      updates.push(`location = $${paramCount++}`);
      values.push(data.location);
    }
    if (data.active !== undefined) {
      updates.push(`active = $${paramCount++}`);
      values.push(data.active);
    }
    if (data.resignation_requested !== undefined) {
      updates.push(`resignation_requested = $${paramCount++}`);
      values.push(data.resignation_requested);
    }
    if (data.resignation_reason !== undefined) {
      updates.push(`resignation_reason = $${paramCount++}`);
      values.push(data.resignation_reason);
    }
    if (data.resignation_date !== undefined) {
      updates.push(`resignation_date = $${paramCount++}`);
      values.push(data.resignation_date ? data.resignation_date.toISOString() : null);
    }

    if (updates.length === 0) {
      return false;
    }

    values.push(studentId);
    const query = `UPDATE students SET ${updates.join(', ')} WHERE student_id = $${paramCount} RETURNING student_id`;
    
    const result = await pool.query(query, values);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error updating student:', error);
    throw error;
  }
}

/**
 * Oznacza studenta jako byłego ucznia zamiast usuwać (TYLKO DLA ADMINÓW)
 * Ustawia active = FALSE i resignation_date = CURRENT_TIMESTAMP
 */
export async function deleteStudent(studentId: string): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    // Sprawdź czy kolumna resignation_date istnieje, jeśli nie - dodaj ją
    try {
      await sql`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS resignation_date TIMESTAMP;
      `;
    } catch (error) {
      console.log('Column resignation_date may already exist');
    }
    
    // Najpierw pobierz user_id studenta przed oznaczeniem jako nieaktywny
    const studentResult = await sql`
      SELECT user_id FROM students WHERE student_id = ${studentId}
    `;
    
    if (studentResult.rows.length === 0) {
      return false;
    }
    
    const userId = studentResult.rows[0].user_id;
    
    // Oznacz studenta jako nieaktywnego
    const result = await sql`
      UPDATE students 
      SET 
        resignation_date = NOW(),
        active = FALSE
      WHERE student_id = ${studentId}
      RETURNING student_id
    `;
    
    if ((result.rowCount ?? 0) === 0) {
      return false;
    }
    
    // Sprawdź czy rodzic ma inne aktywne dzieci (tylko active = TRUE)
    const activeChildrenResult = await sql`
      SELECT COUNT(*)::int as count 
      FROM students 
      WHERE user_id = ${userId} 
        AND active IS TRUE
    `;
    
    const activeChildrenCount = activeChildrenResult.rows[0]?.count || 0;
    
    // Jeśli rodzic NIE MA innych aktywnych dzieci, oznacz go jako nieaktywnego
    if (activeChildrenCount === 0) {
      await sql`
        UPDATE users 
        SET 
          active = FALSE,
          resignation_date = NOW()
        WHERE id = ${userId}
      `;
    }
    
    return true;
  } catch (error) {
    console.error('Error marking student as inactive:', error);
    throw error;
  }
}

/**
 * Przywraca byłego ucznia do aktywnego stanu (TYLKO DLA ADMINÓW)
 * Ustawia active = TRUE i czyści resignation_date
 * Również przywraca rodzica (user) jako active = TRUE
 */
export async function restoreStudent(studentId: string): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    // Najpierw pobierz user_id studenta
    const studentResult = await sql`
      SELECT user_id FROM students WHERE student_id = ${studentId}
    `;
    
    if (studentResult.rows.length === 0) {
      return false;
    }
    
    const userId = studentResult.rows[0].user_id;
    
    // Przywróć studenta
    const result = await sql`
      UPDATE students 
      SET 
        active = TRUE,
        resignation_date = NULL
      WHERE student_id = ${studentId}
      RETURNING student_id
    `;
    
    if ((result.rowCount ?? 0) === 0) {
      return false;
    }
    
    // Sprawdź status rodzica - przywróć tylko jeśli active = FALSE
    const parentResult = await sql`
      SELECT active FROM users WHERE id = ${userId}
    `;
    
    if (parentResult.rows.length > 0) {
      const parentActive = parentResult.rows[0].active;
      
      // Jeśli rodzic ma active = FALSE, zmień na TRUE
      if (parentActive === false) {
        await sql`
          UPDATE users 
          SET 
            active = TRUE,
            resignation_date = NULL
          WHERE id = ${userId}
        `;
        console.log(`Restored student ${studentId} and their parent user ${userId} (parent was inactive)`);
      } else {
        console.log(`Restored student ${studentId}. Parent ${userId} is already active, no change needed`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error restoring student:', error);
    throw error;
  }
}

/**
 * Pobiera studentów według user_id
 */
export async function getStudentsByUserIdAdmin(userId: string): Promise<Student[]> {
  return getStudentsByUserId(userId);
}

/**
 * Aktualizuje rezygnację studenta (dla użytkowników)
 */
export async function requestStudentResignation(
  studentId: string,
  userId: string,
  reason: string
): Promise<boolean> {
  try {
    await ensureTablesExist();
    
    // Sprawdź czy student należy do użytkownika
    const student = await sql`
      SELECT student_id, user_id FROM students 
      WHERE student_id = ${studentId} AND user_id = ${userId}
      LIMIT 1
    `;
    
    if (student.rows.length === 0) {
      return false;
    }
    
    // Aktualizuj rezygnację
    const result = await sql`
      UPDATE students 
      SET 
        resignation_requested = TRUE,
        resignation_reason = ${reason}
      WHERE student_id = ${studentId} AND user_id = ${userId}
      RETURNING student_id
    `;
    
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error requesting student resignation:', error);
    throw error;
  }
}

/**
 * Pobiera wszystkich studentów z zgłoszoną rezygnacją
 */
export async function getStudentsWithResignation(): Promise<Student[]> {
  try {
    await ensureTablesExist();
    
    const result = await sql`
      SELECT * FROM students 
      WHERE resignation_requested = TRUE
      ORDER BY created_at DESC
    `;
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching students with resignation:', error);
    throw error;
  }
}
