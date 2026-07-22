import {
  AppState, addDays, daysAgo, today,
} from './model'

const T = today()

export function seedState(): AppState {
  return {
    areas: [
      { id: 'a_family', name: 'Family / Home', description: 'Home maintenance, kids, simchas, household finances, errands', color: 'hsl(17 63% 47%)', sort: 0, active: true, inBrief: true, reviewDay: 'Sunday' },
      { id: 'a_shul', name: 'Shul', description: 'Committee roles, learning schedule, chesed, events', color: 'hsl(215 45% 42%)', sort: 1, active: true, inBrief: true, reviewDay: 'Thursday' },
      { id: 'a_work', name: 'Work', description: 'Client projects, admin, invoicing, follow-ups', color: 'hsl(152 25% 32%)', sort: 2, active: true, inBrief: true, reviewDay: 'Monday' },
      { id: 'a_ideas', name: 'New Ideas', description: 'Holding pen for things to explore', color: 'hsl(40 65% 42%)', sort: 3, active: true, inBrief: false, reviewDay: 'Sunday' },
    ],
    projects: [
      { id: 'pr_dinner', areaId: 'a_shul', name: 'Shul Annual Dinner', outcome: 'A full hall, happy guests, budget met', status: 'active', priority: 'P0', due: addDays(T, 24), lastActivity: daysAgo(1) },
      { id: 'pr_boiler', areaId: 'a_family', name: 'Boiler & heating fix', outcome: 'Reliable heating before winter', status: 'active', priority: 'P1', due: addDays(T, 12), lastActivity: daysAgo(2) },
      { id: 'pr_barmitzvah', areaId: 'a_family', name: "Yosef's bar mitzvah", outcome: 'Everything booked and paid, calm week-of', status: 'active', priority: 'P1', due: addDays(T, 88), lastActivity: daysAgo(6) },
      { id: 'pr_acme', areaId: 'a_work', name: 'Acme retainer renewal', outcome: 'Signed renewal at improved rate', status: 'active', priority: 'P0', due: addDays(T, 9), lastActivity: daysAgo(0) },
      { id: 'pr_invoicing', areaId: 'a_work', name: 'Q3 invoicing & collections', outcome: 'All invoices out, aged debt under £2k', status: 'active', priority: 'P1', due: addDays(T, 18), lastActivity: daysAgo(12) },
      { id: 'pr_shiur', areaId: 'a_shul', name: 'Tuesday night shiur series', outcome: 'Speakers booked through the season', status: 'on-hold', priority: 'P2', lastActivity: daysAgo(21) },
      { id: 'pr_fridge', areaId: 'a_ideas', name: 'Family calendar on the fridge screen', outcome: 'Explore: shared screen showing the week', status: 'active', priority: 'P3', lastActivity: daysAgo(15) },
      { id: 'pr_garden', areaId: 'a_family', name: 'Garden landscaping', outcome: 'Usable garden by summer', status: 'done', priority: 'P2', lastActivity: daysAgo(30) },
    ],
    tasks: [
      // Today / P0
      { id: 't1', title: 'Confirm caterer numbers for the dinner', type: 'call', areaId: 'a_shul', projectId: 'pr_dinner', personId: 'p_caterer', vendorId: 'v_caterer', categoryIds: ['c_events'], priority: 'P0', status: 'in-progress', due: T, source: 'whatsapp', callAbout: 'Final headcount and dietary list', created: daysAgo(3) },
      { id: 't2', title: 'Send Acme the renewal proposal', type: 'todo', areaId: 'a_work', projectId: 'pr_acme', categoryIds: ['c_admin'], priority: 'P0', status: 'next', due: T, source: 'manual', created: daysAgo(2), notes: 'Use last year’s deck as base; update rates page.' },
      { id: 't3', title: 'Pay gas bill before late fee', type: 'todo', areaId: 'a_family', categoryIds: ['c_money_bills'], priority: 'P0', status: 'next', due: daysAgo(1), source: 'email', created: daysAgo(5) },
      // Dinner parent + subtasks
      { id: 't10', title: 'Run the shul dinner', type: 'todo', areaId: 'a_shul', projectId: 'pr_dinner', categoryIds: ['c_events'], priority: 'P1', status: 'in-progress', due: addDays(T, 24), source: 'manual', created: daysAgo(20), notes: 'Umbrella task — see subtasks.' },
      { id: 't11', title: 'Book the hall', type: 'todo', parentId: 't10', areaId: 'a_shul', projectId: 'pr_dinner', categoryIds: ['c_events'], priority: 'P1', status: 'done', source: 'manual', created: daysAgo(20), completedAt: daysAgo(14) },
      { id: 't12', title: 'Print and send invitations', type: 'todo', parentId: 't10', areaId: 'a_shul', projectId: 'pr_dinner', categoryIds: ['c_events'], priority: 'P1', status: 'done', source: 'manual', created: daysAgo(20), completedAt: daysAgo(7) },
      { id: 't13', title: 'Chase RSVPs from committee list', type: 'followup', parentId: 't10', areaId: 'a_shul', projectId: 'pr_dinner', categoryIds: ['c_events'], actionIds: ['a_followup'], priority: 'P1', status: 'next', due: addDays(T, 2), source: 'manual', created: daysAgo(10) },
      { id: 't14', title: 'Arrange AV and microphones', type: 'todo', parentId: 't10', areaId: 'a_shul', projectId: 'pr_dinner', vendorId: 'v_av', categoryIds: ['c_events'], priority: 'P2', status: 'waiting', waitingOn: 'Hall manager', waitingSince: daysAgo(6), source: 'manual', created: daysAgo(9) },
      { id: 't15', title: 'Seating plan draft', type: 'todo', parentId: 't10', areaId: 'a_shul', projectId: 'pr_dinner', categoryIds: ['c_events'], priority: 'P2', status: 'next', due: addDays(T, 10), source: 'manual', created: daysAgo(4) },
      // Family
      { id: 't20', title: 'Plumber to quote boiler replacement', type: 'call', areaId: 'a_family', projectId: 'pr_boiler', vendorId: 'v_plumber', categoryIds: ['c_home'], priority: 'P1', status: 'waiting', waitingOn: 'Mick the plumber', waitingSince: daysAgo(4), source: 'whatsapp', callAbout: 'Quote for new combi boiler', created: daysAgo(8) },
      { id: 't21', title: 'Buy tickets for the school play', type: 'todo', areaId: 'a_family', categoryIds: [], actionIds: ['a_errand'], priority: 'P2', status: 'next', due: addDays(T, 3), source: 'whatsapp', created: daysAgo(1) },
      { id: 't22', title: 'Renew home insurance', type: 'todo', areaId: 'a_family', categoryIds: ['c_money_ins'], priority: 'P1', status: 'next', due: addDays(T, 6), source: 'email', created: daysAgo(3) },
      { id: 't23', title: 'Book photographer for bar mitzvah', type: 'todo', areaId: 'a_family', projectId: 'pr_barmitzvah', categoryIds: ['c_events'], priority: 'P2', status: 'next', due: addDays(T, 14), source: 'manual', created: daysAgo(6) },
      // Work
      { id: 't30', title: 'Chase invoice #204 — Brightside Ltd', type: 'followup', areaId: 'a_work', projectId: 'pr_invoicing', categoryIds: ['c_money'], actionIds: ['a_followup'], priority: 'P1', status: 'next', due: daysAgo(2), source: 'manual', created: daysAgo(9) },
      { id: 't31', title: 'Prepare Q3 invoices batch', type: 'todo', areaId: 'a_work', projectId: 'pr_invoicing', categoryIds: ['c_money', 'c_admin'], priority: 'P1', status: 'in-progress', due: addDays(T, 4), source: 'manual', created: daysAgo(5) },
      { id: 't32', title: 'Call David re school governor intro', type: 'call', areaId: 'a_work', personId: 'p_david', categoryIds: [], actionIds: ['a_call'], priority: 'P1', status: 'next', due: T, source: 'whatsapp', callAbout: 'He offered an intro to the governors — take him up on it', created: daysAgo(2) },
      { id: 't33', title: 'Send Sarah the article you promised', type: 'followup', areaId: 'a_work', personId: 'p_sarah', categoryIds: [], actionIds: ['a_followup'], priority: 'P1', status: 'next', due: daysAgo(1), source: 'manual', created: daysAgo(6) },
      { id: 't34', title: 'File VAT return', type: 'todo', areaId: 'a_work', categoryIds: ['c_money', 'c_admin'], priority: 'P0', status: 'next', due: addDays(T, 1), source: 'manual', created: daysAgo(4) },
      // Shul misc
      { id: 't40', title: 'Rota for Shabbos hospitality', type: 'todo', areaId: 'a_shul', categoryIds: ['c_chesed'], priority: 'P2', status: 'next', due: addDays(T, 5), source: 'manual', created: daysAgo(3) },
      { id: 't41', title: 'Visit Mr Gold in hospital', type: 'todo', areaId: 'a_shul', categoryIds: ['c_chesed_hosp'], priority: 'P1', status: 'next', due: addDays(T, 1), source: 'whatsapp', created: daysAgo(1) },
      // Ideas
      { id: 't50', title: 'Idea: family calendar on the fridge screen', type: 'todo', areaId: 'a_ideas', projectId: 'pr_fridge', categoryIds: [], priority: 'P3', status: 'next', source: 'whatsapp', created: daysAgo(15) },
      { id: 't51', title: 'Idea: automate the weekly shop', type: 'todo', areaId: 'a_ideas', categoryIds: [], priority: 'P3', status: 'next', source: 'voice', created: daysAgo(8) },
      // Done recently
      { id: 't60', title: 'Book dentist for the kids', type: 'todo', areaId: 'a_family', categoryIds: [], actionIds: ['a_errand'], priority: 'P2', status: 'done', source: 'whatsapp', created: daysAgo(9), completedAt: daysAgo(1) },
      { id: 't61', title: 'Send shul newsletter copy', type: 'todo', areaId: 'a_shul', categoryIds: ['c_admin'], priority: 'P1', status: 'done', source: 'manual', created: daysAgo(7), completedAt: daysAgo(2) },
      { id: 't62', title: 'Approve Acme scope change', type: 'todo', areaId: 'a_work', projectId: 'pr_acme', categoryIds: ['c_admin'], priority: 'P1', status: 'done', source: 'email', created: daysAgo(6), completedAt: T },
      { id: 't63', title: 'Fix the garden gate latch', type: 'todo', areaId: 'a_family', categoryIds: ['c_home'], priority: 'P2', status: 'dropped', droppedReason: 'Handyman doing it as part of bigger job', source: 'manual', created: daysAgo(12), completedAt: daysAgo(3) },
    ],
    people: [
      { id: 'p_mum', name: 'Mum', phone: '+44 7700 900001', tier: 'inner', how: 'Family', topics: 'Family, health, weekend plans', cadenceDays: 3, lastContact: daysAgo(4), vip: true, flaggedForCall: false },
      { id: 'p_rivka', name: 'Rivka (sister)', phone: '+44 7700 900002', tier: 'inner', how: 'Family', topics: 'Kids, simcha planning', lastContact: daysAgo(2), vip: false, flaggedForCall: false },
      { id: 'p_david', name: 'David Feldman', phone: '+44 7700 900010', email: 'david@feldman.co', tier: 'active', how: 'Old colleague', topics: 'School governors, consulting leads', lastContact: daysAgo(21), vip: true, flaggedForCall: true, notes: 'Offered governor intro; owes nothing — you owe him a call.' },
      { id: 'p_sarah', name: 'Sarah Klein', email: 'sarah@kleinadvisory.com', tier: 'active', how: 'Client — Klein Advisory', topics: 'Retainer, referrals', lastContact: daysAgo(9), vip: false, flaggedForCall: false, notes: 'Promised her the pricing article.' },
      { id: 'p_rabbi', name: 'Rabbi Stern', phone: '+44 7700 900020', tier: 'active', how: 'Shul', topics: 'Dinner, shiur series', lastContact: daysAgo(5), vip: true, flaggedForCall: false },
      { id: 'p_gold', name: 'Mr Gold', tier: 'network', how: 'Shul — elderly member', topics: 'Wellbeing check-ins', lastContact: daysAgo(40), vip: false, flaggedForCall: false, notes: 'In hospital — visit this week.' },
      { id: 'p_aaron', name: 'Aaron Levy', phone: '+44 7700 900030', email: 'aaron@levypartners.com', tier: 'network', how: 'Networking dinner 2023', topics: 'Property, investments', lastContact: daysAgo(45), vip: false, flaggedForCall: false },
      { id: 'p_chaim', name: 'Chaim Berger', tier: 'network', how: 'Yeshiva friend', topics: 'Learning, families', lastContact: daysAgo(26), vip: false, flaggedForCall: false },
      { id: 'p_mick', name: 'Mick Doyle', phone: '+44 7700 900040', tier: 'network', how: 'Plumber — recommended by Rivka', topics: 'Boiler job', lastContact: daysAgo(4), vip: false, flaggedForCall: false },
      { id: 'p_ella', name: 'Ella Rosen', email: 'ella.rosen@gmail.com', tier: 'dormant', how: 'Former client', topics: 'Marketing, her bakery', lastContact: daysAgo(140), vip: false, flaggedForCall: false },
      { id: 'p_josh', name: 'Josh Diamond', phone: '+44 7700 900050', tier: 'dormant', how: 'University', topics: 'Catch-ups, tech', lastContact: daysAgo(200), vip: false, flaggedForCall: false },
      { id: 'p_caterer', name: 'Malka (Golan Catering)', phone: '+44 7700 900060', tier: 'network', how: 'Caterer for shul events', topics: 'Dinner menu, numbers', lastContact: daysAgo(6), vip: false, flaggedForCall: false },
    ],
    interactions: [
      { id: 'i1', date: daysAgo(2), personId: 'p_rivka', channel: 'whatsapp', purpose: 'Bar mitzvah planning', outcome: 'She’ll take the invitation list; we split venue visits', sentiment: 'positive' },
      { id: 'i2', date: daysAgo(4), personId: 'p_mum', channel: 'call', purpose: 'Weekly check-in', outcome: 'Doing well; wants the kids on Sunday', sentiment: 'positive' },
      { id: 'i3', date: daysAgo(5), personId: 'p_rabbi', channel: 'in-person', purpose: 'Dinner planning', outcome: 'He’ll open; wants seating plan by next week', sentiment: 'neutral', followUpDate: addDays(T, 10) },
      { id: 'i4', date: daysAgo(9), personId: 'p_sarah', channel: 'email', purpose: 'Retainer scope', outcome: 'Happy with direction; promised her the pricing article', sentiment: 'positive', followUpDate: daysAgo(1) },
      { id: 'i5', date: daysAgo(21), personId: 'p_david', channel: 'call', purpose: 'Catch-up', outcome: 'Offered intro to school governors; said I’d call back in a fortnight', sentiment: 'positive', followUpDate: T },
      { id: 'i6', date: daysAgo(4), personId: 'p_mick', channel: 'whatsapp', purpose: 'Boiler quote', outcome: 'Coming Thursday to measure up', sentiment: 'neutral' },
      { id: 'i7', date: daysAgo(6), personId: 'p_caterer', channel: 'call', purpose: 'Dinner menu', outcome: 'Menu agreed; needs final numbers by Friday', sentiment: 'neutral', followUpDate: T },
      { id: 'i8', date: daysAgo(40), personId: 'p_gold', channel: 'call', purpose: 'Check-in', outcome: 'Sounded frail; now in hospital per shul list', sentiment: 'needs-attention' },
    ],
    categories: [
      { id: 'c_money', name: 'Money', level: 0, active: true, color: 'hsl(152 25% 32%)' },
      { id: 'c_money_bills', name: 'Bills', parentId: 'c_money', level: 1, active: true },
      { id: 'c_money_ins', name: 'Insurance', parentId: 'c_money', level: 1, active: true },
      { id: 'c_admin', name: 'Admin', level: 0, active: true, color: 'hsl(75 6% 40%)' },
      { id: 'c_home', name: 'Home', level: 0, active: true, color: 'hsl(17 40% 40%)' },
      { id: 'c_events', name: 'Events', level: 0, active: true, color: 'hsl(280 25% 45%)' },
      { id: 'c_chesed', name: 'Chesed', level: 0, active: true, color: 'hsl(200 40% 40%)' },
      { id: 'c_chesed_hosp', name: 'Visiting › Hospital', parentId: 'c_chesed', level: 1, active: true },
    ],
    actions: [
      { id: 'a_call', name: 'Call', active: true, color: 'hsl(215 45% 42%)' },
      { id: 'a_meeting', name: 'Meeting', active: true, color: 'hsl(265 35% 45%)' },
      { id: 'a_decide', name: 'Decide', active: true, color: 'hsl(0 45% 45%)' },
      { id: 'a_email', name: 'Email', active: true, color: 'hsl(198 55% 40%)' },
      { id: 'a_followup', name: 'Follow-up', active: true, color: 'hsl(17 63% 47%)' },
      { id: 'a_errand', name: 'Errand', active: true, color: 'hsl(40 65% 42%)' },
      { id: 'a_research', name: 'Research', active: true, color: 'hsl(160 30% 35%)' },
      { id: 'a_review', name: 'Review', active: true, color: 'hsl(35 15% 40%)' },
    ],
    vendors: [
      { id: 'v_plumber', name: 'Mick Doyle Plumbing', category: 'Trades', phone: '+44 7700 900040', rating: 4, notes: 'Reliable, books up fast' },
      { id: 'v_caterer', name: 'Golan Catering', category: 'Catering', phone: '+44 7700 900060', rating: 5, notes: 'Shul dinner caterer' },
      { id: 'v_av', name: 'SoundRight AV', category: 'Events', rating: 3, notes: 'Used for last year’s dinner; mics were patchy' },
    ],
    collections: [
      { id: 'col_ent', name: 'Entertainment', description: 'Things to watch and read', color: 'hsl(280 25% 45%)', active: true },
      { id: 'col_fin', name: 'Financial', description: 'Subscriptions and policies', color: 'hsl(152 25% 32%)', active: true },
      { id: 'col_personal', name: 'Personal', description: 'Dates and things worth not forgetting', color: 'hsl(340 45% 45%)', active: true },
    ],
    trackers: [
      {
        id: 'trk_dates', collectionId: 'col_personal', name: 'Dates to Remember', description: 'Birthdays, anniversaries, and other dates worth a nudge — export to your calendar from Collections',
        defaultView: 'table', active: true,
        columns: [
          { key: 'name', name: 'Name', type: 'text', isTitle: true, required: true },
          { key: 'date', name: 'Date', type: 'date', required: true },
          { key: 'recurring', name: 'Repeats every year', type: 'checkbox' },
          { key: 'type', name: 'Type', type: 'select', options: ['Birthday', 'Anniversary', 'Other'] },
          { key: 'notes', name: 'Notes', type: 'longtext' },
        ],
      },
      {
        id: 'trk_movies', collectionId: 'col_ent', name: 'Movies', description: 'The watch-list', defaultView: 'board', active: true,
        columns: [
          { key: 'name', name: 'Name', type: 'text', isTitle: true, required: true },
          { key: 'starring', name: 'Starring', type: 'text' },
          { key: 'release', name: 'Release date', type: 'date' },
          { key: 'platform', name: 'Platform', type: 'select', options: ['Netflix', 'Prime', 'Disney+', 'Cinema'] },
          { key: 'status', name: 'Status', type: 'status', options: ['Want to watch', 'Watching', 'Watched'] },
          { key: 'rating', name: 'Rating', type: 'rating', showWhen: { columnKey: 'status', equals: 'Watched' } },
        ],
      },
      {
        id: 'trk_books', collectionId: 'col_ent', name: 'Books', description: 'Reading list', defaultView: 'table', active: true,
        columns: [
          { key: 'title', name: 'Title', type: 'text', isTitle: true, required: true },
          { key: 'author', name: 'Author', type: 'text' },
          { key: 'status', name: 'Status', type: 'status', options: ['To read', 'Reading', 'Finished'] },
          { key: 'finished', name: 'Date finished', type: 'date', showWhen: { columnKey: 'status', equals: 'Finished' } },
          { key: 'rating', name: 'Rating', type: 'rating', showWhen: { columnKey: 'status', equals: 'Finished' } },
        ],
      },
      {
        id: 'trk_subs', collectionId: 'col_fin', name: 'Subscriptions', description: 'Everything on direct debit', defaultView: 'table', active: true,
        columns: [
          { key: 'service', name: 'Service', type: 'text', isTitle: true, required: true },
          { key: 'cost', name: 'Monthly cost', type: 'currency' },
          { key: 'renewal', name: 'Renewal date', type: 'date' },
          { key: 'status', name: 'Status', type: 'status', options: ['Active', 'Cancelling', 'Cancelled'] },
          { key: 'notes', name: 'Notes', type: 'longtext' },
        ],
      },
    ],
    entries: [
      { id: 'e1', trackerId: 'trk_movies', created: daysAgo(30), values: { name: 'The Zone of Interest', starring: 'Christian Friedel', platform: 'Prime', status: 'Want to watch' } },
      { id: 'e2', trackerId: 'trk_movies', created: daysAgo(60), values: { name: 'Oppenheimer', starring: 'Cillian Murphy', platform: 'Prime', status: 'Watched', rating: 5 } },
      { id: 'e3', trackerId: 'trk_movies', created: daysAgo(10), values: { name: 'A Real Pain', starring: 'Jesse Eisenberg', platform: 'Cinema', status: 'Want to watch' } },
      { id: 'e4', trackerId: 'trk_movies', created: daysAgo(20), values: { name: 'Shtisel S3', starring: 'Michael Aloni', platform: 'Netflix', status: 'Watching' } },
      { id: 'e5', trackerId: 'trk_books', created: daysAgo(50), values: { title: 'Deep Work', author: 'Cal Newport', status: 'Finished', finished: daysAgo(12), rating: 4 } },
      { id: 'e6', trackerId: 'trk_books', created: daysAgo(14), values: { title: 'The Checklist Manifesto', author: 'Atul Gawande', status: 'Reading' } },
      { id: 'e7', trackerId: 'trk_subs', created: daysAgo(90), values: { service: 'Netflix', cost: 10.99, renewal: addDays(T, 9), status: 'Active' } },
      { id: 'e8', trackerId: 'trk_subs', created: daysAgo(90), values: { service: 'Amazon Prime', cost: 8.99, renewal: addDays(T, 21), status: 'Active' } },
      { id: 'e9', trackerId: 'trk_subs', created: daysAgo(90), values: { service: 'Gym membership', cost: 42, renewal: addDays(T, 5), status: 'Active', notes: 'Barely used — candidate to cancel' } },
      { id: 'e10', trackerId: 'trk_subs', created: daysAgo(90), values: { service: 'Old cloud storage', cost: 7.99, status: 'Cancelling', notes: 'No renewal date on file' } },
      { id: 'e11', trackerId: 'trk_dates', created: daysAgo(200), values: { name: 'Mum’s birthday', date: '1958-08-02', recurring: true, type: 'Birthday' } },
      { id: 'e12', trackerId: 'trk_dates', created: daysAgo(200), values: { name: 'Wedding anniversary', date: '2015-07-29', recurring: true, type: 'Anniversary' } },
      { id: 'e13', trackerId: 'trk_dates', created: daysAgo(200), values: { name: 'Rabbi Stern’s birthday', date: '1970-09-15', recurring: true, type: 'Birthday' } },
      { id: 'e14', trackerId: 'trk_dates', created: daysAgo(5), values: { name: 'Passport renewal due', date: addDays(T, 25), recurring: false, type: 'Other', notes: 'Apply at least 6 weeks ahead' } },
    ],
    captures: [
      { id: 'cap1', text: 'buy tickets for the shul dinner', source: 'whatsapp', created: daysAgo(0), status: 'pending', proposal: { kind: 'task', taskType: 'todo', areaId: 'a_shul', projectId: 'pr_dinner', priority: 'P1', title: 'Buy tickets for the shul dinner', due: addDays(T, 3), explanation: '“shul dinner” matched Shul › Annual Dinner' } },
      { id: 'cap2', text: 'voice note: remind me to check the car MOT date sometime this month', source: 'voice', created: daysAgo(0), status: 'pending', proposal: { kind: 'task', taskType: 'todo', areaId: 'a_family', priority: 'P2', title: 'Check the car MOT date', explanation: 'Transcribed voice note · “car” → Family / Home · “this month” → P2' } },
      { id: 'cap3', text: 'Fwd: Invoice overdue — Brightside Ltd', source: 'email', created: daysAgo(1), status: 'pending', proposal: { kind: 'task', taskType: 'followup', areaId: 'a_work', projectId: 'pr_invoicing', priority: 'P1', title: 'Reply to Brightside re overdue invoice', due: addDays(T, 1), explanation: 'Forwarded email · sender matched Work › Q3 invoicing' } },
    ],
    audit: [
      { id: 'au1', ts: daysAgo(2) + 'T09:14:00', user: 'Craig', action: 'created', entity: 'task', entityId: 't21', detail: 'Captured by WhatsApp: “buy tickets for the school play”' },
      { id: 'au2', ts: daysAgo(2) + 'T09:14:05', user: 'AI router', action: 'routed', entity: 'task', entityId: 't21', detail: 'Filed under Family / Home · priority P2 · due in 3 days' },
      { id: 'au3', ts: daysAgo(1) + 'T18:40:00', user: 'Craig', action: 'completed', entity: 'task', entityId: 't60', detail: 'Book dentist for the kids → Done (archived)' },
      { id: 'au4', ts: daysAgo(1) + 'T18:41:00', user: 'Craig', action: 'logged call', entity: 'person', entityId: 'p_mum', detail: 'Weekly check-in · positive' },
      { id: 'au5', ts: T + 'T07:30:00', user: 'System', action: 'sent brief', entity: 'brief', entityId: 'brief-' + T, detail: 'Morning brief delivered (WhatsApp placeholder)' },
    ],
    adminUsers: [
      { id: 'u_craig', name: 'Craig', email: 'yisroelswimmer@gmail.com', role: 'owner', status: 'active', lastActive: T, hasSample: true, hasReal: true, isSuperAdmin: true },
      { id: 'u_dina', name: 'Dina S', email: 'dina@example.com', role: 'member', status: 'active', lastActive: daysAgo(1), hasSample: true, hasReal: true },
      { id: 'u_moshe', name: 'Moshe B', email: 'moshe@example.com', role: 'view-only', status: 'invited', hasSample: true, hasReal: false },
    ],
    settings: {
      theme: 'sage',
      priorityScheme: 'p',
      eisenhower: false,
      dailyCapacity: 6,
      callGoal: 3,
      followUpDays: 3,
      briefChannel: 'whatsapp',
      briefTime: '07:30',
      timezone: 'Europe/London',
      lunchTime: '12:30',
      stallDays: 14,
      projectWipLimit: 3,
      tierCadence: { inner: 7, active: 14, network: 30, dormant: 90 },
      quickActions: { done: true, called: true, snooze: true, reassign: true },
      features: {
        whatsapp: true, emailForward: true, gmail: false, outlook: false,
        sms: false, slack: false, teams: false, voiceNotes: true,
        calendar: false, collections: true, morningBrief: true, lunchReminder: true,
      },
    },
  }
}

// A freshly provisioned "real" account: defaults seeded, no data yet.
export function emptyState(userName: string): AppState {
  const s = seedState()
  return {
    ...s,
    projects: [],
    tasks: [],
    people: [],
    interactions: [],
    vendors: [],
    entries: [],
    captures: [{
      id: 'cap_welcome',
      text: `Welcome, ${userName} — send anything on your mind and I’ll file it`,
      source: 'manual',
      created: T,
      status: 'pending',
      proposal: { kind: 'note', taskType: 'todo', priority: 'P3', title: 'Try your first capture', explanation: 'Onboarding note — your areas, categories and trackers are pre-seeded; everything else starts empty' },
    }],
    audit: [{ id: 'au_prov', ts: T + 'T09:00', user: 'System', action: 'provisioned', entity: 'account', entityId: userName, detail: 'Real account created — defaults seeded (areas, categories, tiers, trackers)' }],
    adminUsers: [],
  }
}
