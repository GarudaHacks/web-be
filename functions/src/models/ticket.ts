export interface Ticket {
  id: string;
  topic: string;
  description: string;
  location: string;
  requestorId: string;
  tags: string[];
  taken: boolean;
  resolved: boolean;
}

export const formatTicket = (data: Partial<Ticket>): Ticket => ({
  id: data.id || "",
  topic: data.topic || "",
  description: data.description || "",
  location: data.location || "",
  requestorId: data.requestorId || "",
  tags: Array.isArray(data.tags) ? data.tags : [],
  taken: data.taken ?? false,
  resolved: data.resolved ?? false,
});
