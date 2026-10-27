// "L" lines, their colors, and a run of stations along each one.
// Each solved puzzle moves you one stop; at the end of a line you transfer.

export const LINES = [
  { name: 'Red', color: '#C60C30', on: '#FFFFFF', stops: ['Howard', 'Loyola', 'Bryn Mawr', 'Wilson', 'Addison', 'Belmont', 'Fullerton', 'North/Clybourn', 'Clark/Division', 'Chicago', 'Grand', 'Lake', 'Monroe', 'Jackson', 'Roosevelt', 'Cermak-Chinatown', 'Sox-35th', 'Garfield', '95th/Dan Ryan'] },
  { name: 'Blue', color: '#00A1DE', on: '#FFFFFF', stops: ["O'Hare", 'Rosemont', 'Cumberland', 'Jefferson Park', 'Logan Square', 'California', 'Damen', 'Division', 'Chicago', 'Grand', 'Clark/Lake', 'Washington', 'Monroe', 'Jackson', 'UIC-Halsted', 'Racine', 'Illinois Medical District', 'Forest Park'] },
  { name: 'Brown', color: '#62361B', on: '#FFFFFF', stops: ['Kimball', 'Kedzie', 'Western', 'Damen', 'Montrose', 'Irving Park', 'Addison', 'Paulina', 'Southport', 'Belmont', 'Wellington', 'Diversey', 'Fullerton', 'Armitage', 'Sedgwick', 'Chicago', 'Merchandise Mart'] },
  { name: 'Green', color: '#009B3A', on: '#FFFFFF', stops: ['Harlem/Lake', 'Oak Park', 'Austin', 'Central', 'Cicero', 'Pulaski', 'Kedzie', 'California', 'Ashland', 'Morgan', 'Clinton', 'Roosevelt', 'Cermak-McCormick Place', '35th-Bronzeville-IIT', 'Indiana', 'Garfield', 'Cottage Grove'] },
  { name: 'Orange', color: '#F9461C', on: '#FFFFFF', stops: ['Midway', 'Pulaski', 'Kedzie', 'Western', '35th/Archer', 'Ashland', 'Halsted', 'Roosevelt'] },
  { name: 'Pink', color: '#E27EA6', on: '#16171A', stops: ['54th/Cermak', 'Cicero', 'Kostner', 'Pulaski', 'Central Park', 'Kedzie', 'California', 'Western', 'Damen', '18th', 'Polk', 'Ashland', 'Morgan', 'Clinton'] },
  { name: 'Purple', color: '#522398', on: '#FFFFFF', stops: ['Linden', 'Central', 'Noyes', 'Foster', 'Davis', 'Dempster', 'Main', 'South Boulevard', 'Howard'] },
  { name: 'Yellow', color: '#F9E300', on: '#16171A', stops: ['Dempster-Skokie', 'Oakton-Skokie', 'Howard'] },
];

const ROUTE = LINES.flatMap((line, li) => line.stops.map((stop, si) => ({ li, si })));

export function stopAt(pos) {
  const { li, si } = ROUTE[((pos % ROUTE.length) + ROUTE.length) % ROUTE.length];
  const line = LINES[li];
  return {
    line,
    station: line.stops[si],
    prev: line.stops[si - 1] ?? null,
    next: line.stops[si + 1] ?? null,
    index: si,
    length: line.stops.length,
  };
}
