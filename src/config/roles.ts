/**
 * Definicja dodatkowych ról (poza kierunkami) oraz grup wyboru.
 *
 * Grupy służą do:
 *  - utworzenia ról w skrypcie `setup`,
 *  - logiki "zatwierdzenia" — użytkownik musi wybrać po jednej roli z każdej
 *    grupy (oraz kierunek), aby otrzymać rolę `zatwierdzony`.
 */

export interface SelectableRole {
  /** Nazwa roli — jednocześnie klucz wyszukiwania po nazwie na serwerze */
  name: string;
  emoji: string;
  /** Krótki opis pokazywany przy wyborze */
  description?: string;
}

export interface RoleGroup {
  /** Techniczny identyfikator grupy (np. "plec") */
  id: string;
  /** Nazwa wyświetlana grupy */
  label: string;
  /** Czy z grupy można wybrać tylko jedną rolę (wykluczające się role) */
  exclusive: boolean;
  /** Czy wybór z tej grupy jest wymagany do "zatwierdzenia" */
  requiredForApproval: boolean;
  roles: SelectableRole[];
}

/** Rola nadawana po wybraniu wszystkich wymaganych ról. */
export const APPROVED_ROLE_NAME = 'Zatwierdzony ✅';

/** Grupy ról inne niż kierunki. */
export const ROLE_GROUPS: RoleGroup[] = [
  {
    id: 'plec',
    label: 'Płeć',
    exclusive: true,
    requiredForApproval: true,
    roles: [
      { name: 'Kobieta', emoji: '♀️' },
      { name: 'Mężczyzna', emoji: '♂️' },
    ],
  },
  {
    id: 'rok',
    label: 'Rok / staż',
    exclusive: true,
    requiredForApproval: true,
    roles: [
      { name: 'Pierwszak', emoji: '🐣', description: 'Rozpoczynasz studia' },
      { name: 'Senior', emoji: '🎓', description: 'Studiujesz już od jakiegoś czasu' },
    ],
  },
  {
    id: 'szkola',
    label: 'Szkoła średnia',
    exclusive: true,
    requiredForApproval: true,
    roles: [
      { name: 'Po technikum', emoji: '🔧' },
      { name: 'Po liceum', emoji: '📖' },
    ],
  },
];

/** Płaska lista wszystkich dodatkowych ról do utworzenia (bez roli zatwierdzonej). */
export function allSelectableRoles(): SelectableRole[] {
  return ROLE_GROUPS.flatMap((g) => g.roles);
}
