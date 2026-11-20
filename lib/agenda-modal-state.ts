export function agendaCalendarInstanceKey(view: string, selectedDay: string, initialOpen: boolean) {
  return `${view}-${selectedDay}-${initialOpen ? 'new' : 'closed'}`
}
