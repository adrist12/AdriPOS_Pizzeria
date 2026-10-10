export class User{
    
    constructor(
        public readonly userId: string,
        public readonly userName: string,
        //Se compara con el card dentro de unicenta 
        public readonly userPassword: string | null,
        public readonly userRole: string,
        public readonly userVisibility: boolean
    ){}
}
	
		
	
